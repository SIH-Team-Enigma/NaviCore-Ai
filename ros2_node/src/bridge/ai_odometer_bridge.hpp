#pragma once

#include <memory>
#include <rclcpp/rclcpp.hpp>
#include <std_msgs/msg/header.hpp>
#include "navicore/types.hpp"
#include "navicore/eskf.hpp"

#if __has_include("navicore_ros2/msg/ai_odometer.hpp")
#include "navicore_ros2/msg/ai_odometer.hpp"
using AiOdometerMsg = navicore_ros2::msg::AiOdometer;
#else
namespace navicore_ros2 {
namespace msg {
struct AiOdometer {
    std_msgs::msg::Header header;
    float vx{0.0f};
    float variance{0.01f};
    float stopped_prob{0.0f};
    using SharedPtr = std::shared_ptr<AiOdometer>;
};
} // namespace msg
} // namespace navicore_ros2
using AiOdometerMsg = navicore_ros2::msg::AiOdometer;
#endif

namespace navicore_ros2 {

class AiOdometerBridge {
public:
    AiOdometerBridge(rclcpp::Node* node, navicore::EskfFilter* eskf);
    void Callback(const AiOdometerMsg::SharedPtr msg);

private:
    rclcpp::Node* node_{nullptr};
    navicore::EskfFilter* eskf_{nullptr};
    rclcpp::Subscription<AiOdometerMsg>::SharedPtr sub_ai_odom_;
};

} // namespace navicore_ros2
