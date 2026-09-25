#include "ai_odometer_bridge.hpp"
#include <cmath>

namespace navicore_ros2 {

AiOdometerBridge::AiOdometerBridge(rclcpp::Node* node, navicore::EskfFilter* eskf)
    : node_(node), eskf_(eskf) {
    if (node_ && eskf_) {
        sub_ai_odom_ = node_->create_subscription<AiOdometerMsg>(
            "/navicore/ai_odometer", 10,
            std::bind(&AiOdometerBridge::Callback, this, std::placeholders::_1));
        RCLCPP_INFO(node_->get_logger(), "AI Odometer Bridge subscribed to /navicore/ai_odometer");
    }
}

void AiOdometerBridge::Callback(const AiOdometerMsg::SharedPtr msg) {
    if (!eskf_ || !msg) return;

    navicore::OdometerOutput odom;
    odom.vx_mps = msg->vx;
    odom.variance_vx = msg->variance;
    odom.stopped_prob = msg->stopped_prob;

    // Trigger Zero-Velocity Update if stationary probability is high or speed is negligible
    if (odom.stopped_prob >= 0.85f || (std::abs(odom.vx_mps) < 0.05f && odom.stopped_prob > 0.5f)) {
        eskf_->ApplyZupt();
    } else {
        // Retrieve current heading in radians from ESKF nominal state
        float heading_rad = eskf_->GetState().heading_rad;
        eskf_->UpdateAiOdometer(odom, heading_rad);
    }
}

} // namespace navicore_ros2
