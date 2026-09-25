#include <memory>
#include <cmath>
#include <string>
#include <rclcpp/rclcpp.hpp>
#include <sensor_msgs/msg/imu.hpp>
#include <sensor_msgs/msg/nav_sat_fix.hpp>
#include <sensor_msgs/msg/nav_sat_status.hpp>
#include <nav_msgs/msg/odometry.hpp>
#include <geometry_msgs/msg/pose_with_covariance_stamped.hpp>
#include <std_msgs/msg/string.hpp>

#include "navicore/types.hpp"
#include "navicore/eskf.hpp"
#include "navicore/auto_calib.hpp"
#include "../bridge/ai_odometer_bridge.hpp"

class NaviCoreRosNode : public rclcpp::Node {
public:
    NaviCoreRosNode() : Node("navicore_fusion_node") {
        RCLCPP_INFO(this->get_logger(), "Starting NaviCore AI ROS 2 Fusion Node (REP-105 Compliant)...");

        eskf_ = std::make_unique<navicore::EskfFilter>();
        calibrator_ = std::make_unique<navicore::MountCalibrator>();
        ai_bridge_ = std::make_unique<navicore_ros2::AiOdometerBridge>(this, eskf_.get());

        // Subscribers
        sub_imu_ = this->create_subscription<sensor_msgs::msg::Imu>(
            "/navicore/imu", 50,
            std::bind(&NaviCoreRosNode::ImuCallback, this, std::placeholders::_1));

        sub_gnss_ = this->create_subscription<sensor_msgs::msg::NavSatFix>(
            "/navicore/gps", 10,
            std::bind(&NaviCoreRosNode::GnssCallback, this, std::placeholders::_1));

        // Publishers (Conforming to ROS REP-105 & NaviCore Standards)
        pub_odom_ = this->create_publisher<nav_msgs::msg::Odometry>("/navicore/odom", 10);
        pub_fix_ = this->create_publisher<sensor_msgs::msg::NavSatFix>("/navicore/fix", 10);
        pub_pose_ = this->create_publisher<geometry_msgs::msg::PoseWithCovarianceStamped>("/navicore/pose", 10);
        pub_status_ = this->create_publisher<std_msgs::msg::String>("/navicore/status", 10);
    }

private:
    std::unique_ptr<navicore::EskfFilter> eskf_;
    std::unique_ptr<navicore::MountCalibrator> calibrator_;
    std::unique_ptr<navicore_ros2::AiOdometerBridge> ai_bridge_;

    rclcpp::Subscription<sensor_msgs::msg::Imu>::SharedPtr sub_imu_;
    rclcpp::Subscription<sensor_msgs::msg::NavSatFix>::SharedPtr sub_gnss_;

    rclcpp::Publisher<nav_msgs::msg::Odometry>::SharedPtr pub_odom_;
    rclcpp::Publisher<sensor_msgs::msg::NavSatFix>::SharedPtr pub_fix_;
    rclcpp::Publisher<geometry_msgs::msg::PoseWithCovarianceStamped>::SharedPtr pub_pose_;
    rclcpp::Publisher<std_msgs::msg::String>::SharedPtr pub_status_;

    rclcpp::Time last_imu_time_{0, 0, RCL_ROS_TIME};

    // ENU Coordinate Origin
    bool has_origin_{false};
    double origin_lat_{19.0760};
    double origin_lon_{72.8777};
    double origin_alt_{10.0};
    static constexpr double WGS84_A = 6378137.0; // Earth equatorial radius (meters)

    void ImuCallback(const sensor_msgs::msg::Imu::SharedPtr msg) {
        rclcpp::Time current_time = msg->header.stamp;
        float dt = 0.01f;
        if (last_imu_time_.nanoseconds() > 0) {
            dt = static_cast<float>((current_time - last_imu_time_).seconds());
            if (dt <= 0.0f || dt > 0.5f) dt = 0.01f;
        }
        last_imu_time_ = current_time;

        navicore::ImuSample sample;
        sample.timestamp_nanos = current_time.nanoseconds();
        sample.ax = static_cast<float>(msg->linear_acceleration.x);
        sample.ay = static_cast<float>(msg->linear_acceleration.y);
        sample.az = static_cast<float>(msg->linear_acceleration.z);
        sample.gx = static_cast<float>(msg->angular_velocity.x);
        sample.gy = static_cast<float>(msg->angular_velocity.y);
        sample.gz = static_cast<float>(msg->angular_velocity.z);

        calibrator_->Ingest(sample);

        float vx, vy, vz;
        calibrator_->TransformBodyToVehicle(sample.ax, sample.ay, sample.az, vx, vy, vz);
        sample.ax = vx; sample.ay = vy; sample.az = vz;

        eskf_->Predict(sample, dt);

        PublishState(msg->header);
    }

    void GnssCallback(const sensor_msgs::msg::NavSatFix::SharedPtr msg) {
        if (msg->status.status >= sensor_msgs::msg::NavSatStatus::STATUS_FIX) {
            navicore::GnssFix fix;
            fix.timestamp_nanos = rclcpp::Time(msg->header.stamp).nanoseconds();
            fix.latitude_deg = msg->latitude;
            fix.longitude_deg = msg->longitude;
            fix.altitude_m = msg->altitude;

            if (!has_origin_) {
                origin_lat_ = fix.latitude_deg;
                origin_lon_ = fix.longitude_deg;
                origin_alt_ = fix.altitude_m;
                has_origin_ = true;
            }

            eskf_->UpdateGnss(fix);
        }
    }

    void GeoToLocalEnu(double lat, double lon, double alt, double& east, double& north, double& up) const {
        constexpr double DEG2RAD = 3.14159265358979323846 / 180.0;
        double lat_rad = origin_lat_ * DEG2RAD;
        double d_lat = (lat - origin_lat_) * DEG2RAD;
        double d_lon = (lon - origin_lon_) * DEG2RAD;

        north = d_lat * WGS84_A;
        east = d_lon * WGS84_A * std::cos(lat_rad);
        up = alt - origin_alt_;
    }

    static std::string ModeToString(navicore::FusionMode mode) {
        switch (mode) {
            case navicore::FusionMode::OPEN_SKY:
                return "OPEN_SKY";
            case navicore::FusionMode::DEAD_RECKONING:
                return "DEAD_RECKONING";
            case navicore::FusionMode::ZUPT_LOCKED:
                return "ZUPT_LOCKED";
            default:
                return "OPEN_SKY";
        }
    }

    void PublishState(const std_msgs::msg::Header& header) {
        navicore::FusionState state = eskf_->GetState();

        if (!has_origin_) {
            origin_lat_ = state.latitude_deg;
            origin_lon_ = state.longitude_deg;
            origin_alt_ = state.altitude_m;
            has_origin_ = true;
        }

        // 1. Convert to local Cartesian ENU frame (REP-105 standard)
        double east_m = 0.0, north_m = 0.0, up_m = 0.0;
        GeoToLocalEnu(state.latitude_deg, state.longitude_deg, state.altitude_m, east_m, north_m, up_m);

        // Yaw orientation quaternion for REP-105 (yaw about +Z Up axis)
        double half_yaw = static_cast<double>(state.heading_rad) * 0.5;
        double qz = std::sin(half_yaw);
        double qw = std::cos(half_yaw);

        // 2. Publish nav_msgs/Odometry on /navicore/odom
        nav_msgs::msg::Odometry odom;
        odom.header.stamp = header.stamp;
        odom.header.frame_id = "odom";
        odom.child_frame_id = "base_link";

        odom.pose.pose.position.x = east_m;
        odom.pose.pose.position.y = north_m;
        odom.pose.pose.position.z = up_m;
        odom.pose.pose.orientation.x = 0.0;
        odom.pose.pose.orientation.y = 0.0;
        odom.pose.pose.orientation.z = qz;
        odom.pose.pose.orientation.w = qw;

        odom.twist.twist.linear.x = state.speed_mps;
        odom.twist.twist.linear.y = 0.0;
        odom.twist.twist.linear.z = 0.0;

        pub_odom_->publish(odom);

        // 3. Publish sensor_msgs/NavSatFix on /navicore/fix (Raw Geographic Coordinates)
        sensor_msgs::msg::NavSatFix fix;
        fix.header.stamp = header.stamp;
        fix.header.frame_id = "wgs84";
        fix.latitude = state.latitude_deg;
        fix.longitude = state.longitude_deg;
        fix.altitude = state.altitude_m;
        fix.status.status = (state.mode == navicore::FusionMode::OPEN_SKY)
            ? sensor_msgs::msg::NavSatStatus::STATUS_FIX
            : sensor_msgs::msg::NavSatStatus::STATUS_NO_FIX;
        pub_fix_->publish(fix);

        // 4. Publish PoseWithCovarianceStamped on /navicore/pose
        geometry_msgs::msg::PoseWithCovarianceStamped pose_cov;
        pose_cov.header = odom.header;
        pose_cov.pose.pose = odom.pose.pose;
        // Map 15-state covariance diagonal into pose covariance (6x6)
        if (state.covariance_diagonal.size() >= 3) {
            pose_cov.pose.covariance[0] = state.covariance_diagonal[0];  // x variance
            pose_cov.pose.covariance[7] = state.covariance_diagonal[1];  // y variance
            pose_cov.pose.covariance[14] = state.covariance_diagonal[2]; // z variance
        }
        pub_pose_->publish(pose_cov);

        // 5. Publish status string on /navicore/status
        std_msgs::msg::String status_msg;
        status_msg.data = ModeToString(state.mode);
        pub_status_->publish(status_msg);
    }
};

int main(int argc, char** argv) {
    rclcpp::init(argc, argv);
    auto node = std::make_shared<NaviCoreRosNode>();
    rclcpp::spin(node);
    rclcpp::shutdown();
    return 0;
}
