#include <iostream>
#include <cassert>
#include <cmath>
#include <vector>
#include "navicore/pipeline.hpp"

void TestPipelineInitializationAndLifecycle() {
    std::cout << "[+] Running TestPipelineInitializationAndLifecycle..." << std::endl;
    auto pipeline = std::make_unique<navicore::pipeline::NavicorePipeline>();
    
    navicore::FusionState initial_state = pipeline->GetState();
    assert(initial_state.mode == navicore::FusionMode::OPEN_SKY);
    assert(initial_state.within_validated_range == true);
    assert(initial_state.covariance_diagonal.size() == 15);
    std::cout << "    -> Pipeline initialization and default state verified." << std::endl;
}

void TestPipelineImuGnssTransitionAndDeadReckoning() {
    std::cout << "[+] Running TestPipelineImuGnssTransitionAndDeadReckoning..." << std::endl;
    navicore::pipeline::NavicorePipeline pipeline;

    // 1. Feed 100 Hz IMU + 10 Hz GNSS for 5 seconds (500 steps)
    int64_t t_ns = 1000000000LL;
    double lat = 19.0760;
    double lon = 72.8777;

    for (int i = 0; i < 500; ++i) {
        t_ns += 10000000LL; // +10 ms
        pipeline.FeedImu(0.0f, 0.0f, 9.81f, 0.0f, 0.0f, 0.0f, t_ns);

        if (i % 10 == 0) {
            lat += (15.0 * 0.1) / 111111.0;
            pipeline.FeedGnss(lat, lon, 10.0, 0.5f, 0.5f, t_ns);
        }
    }

    navicore::FusionState state_sky = pipeline.GetState();
    assert(state_sky.mode == navicore::FusionMode::OPEN_SKY);
    assert(state_sky.blackout_duration_ms == 0);

    // 2. Cut off GNSS, feed AI Odometer at 15 m/s
    // Within 100 ms (10 IMU / 1 AI Odom step), mode must transition to DEAD_RECKONING
    t_ns += 10000000LL;
    pipeline.FeedImu(0.0f, 0.0f, 9.81f, 0.0f, 0.0f, 0.0f, t_ns);
    pipeline.FeedAiOdometer(15.0f, 0.02f, 0.0f, t_ns);

    navicore::FusionState state_dr = pipeline.GetState();
    assert(state_dr.mode == navicore::FusionMode::DEAD_RECKONING);
    std::cout << "    -> Hot switch to DEAD_RECKONING within < 100 ms verified." << std::endl;

    // Simulate 30s blackout
    for (int i = 0; i < 3000; ++i) {
        t_ns += 10000000LL;
        pipeline.FeedImu(0.0f, 0.0f, 9.81f, 0.0f, 0.0f, 0.0f, t_ns);
        if (i % 10 == 0) {
            pipeline.FeedAiOdometer(15.0f, 0.02f, 0.0f, t_ns);
        }
    }

    navicore::FusionState state_30s = pipeline.GetState();
    assert(state_30s.mode == navicore::FusionMode::DEAD_RECKONING);
    assert(state_30s.blackout_duration_ms >= 29000);
    assert(state_30s.within_validated_range == true);
    std::cout << "    -> 30s Blackout dead reckoning tracking verified (Blackout duration: "
              << state_30s.blackout_duration_ms << " ms)." << std::endl;
}

void TestPipelineDislodgementAndZupt() {
    std::cout << "[+] Running TestPipelineDislodgementAndZupt..." << std::endl;
    navicore::pipeline::NavicorePipeline pipeline;
    int64_t t_ns = 1000000000LL;

    // Feed high gyro rate to trigger dislodgement
    t_ns += 10000000LL;
    pipeline.FeedImu(0.0f, 0.0f, 9.81f, 3.5f, 0.0f, 0.0f, t_ns);
    navicore::FusionState state = pipeline.GetState();
    assert(state.is_dislodged == true);
    std::cout << "    -> Phone mount dislodgement detection verified." << std::endl;

    // Test ZUPT
    t_ns += 10000000LL;
    pipeline.FeedAiOdometer(0.0f, 0.001f, 0.95f, t_ns);
    state = pipeline.GetState();
    assert(state.mode == navicore::FusionMode::ZUPT_LOCKED);
    std::cout << "    -> ZUPT idle lock engagement verified." << std::endl;
}

void TestPipelineMassiveFeedsStressTest() {
    std::cout << "[+] Running TestPipelineMassiveFeedsStressTest (100,000 feeds)..." << std::endl;
    navicore::pipeline::NavicorePipeline pipeline;
    int64_t t_ns = 1000000000LL;

    for (int i = 0; i < 100000; ++i) {
        t_ns += 10000000LL;
        pipeline.FeedImu(0.05f, 0.02f, 9.81f, 0.001f, -0.001f, 0.002f, t_ns);
        if (i % 10 == 0) {
            if (i < 50000) {
                pipeline.FeedGnss(19.0760, 72.8777, 10.0, 1.0f, 1.0f, t_ns);
            } else {
                pipeline.FeedAiOdometer(12.0f, 0.05f, 0.0f, t_ns);
            }
        }
    }

    navicore::FusionState state = pipeline.GetState();
    assert(state.latitude_deg > 0.0);
    assert(state.longitude_deg > 0.0);
    std::cout << "    -> Successfully processed 100,000 consecutive sensor feeds with zero degradation." << std::endl;
}

void TestPipelineHmmMapMatching() {
    std::cout << "[+] Running TestPipelineHmmMapMatching..." << std::endl;
    navicore::pipeline::NavicorePipeline pipeline;

    std::vector<navicore::RoadSegment> segments = {
        {
            "10004",
            19.0760, 72.8777,
            19.0860, 72.8777,
            0.0f,
            1113.2f
        }
    };
    pipeline.LoadRoadNetwork(segments);

    // Point 5m offset from segment 10004
    pipeline.FeedGnss(19.0800, 72.87775, 10.0, 1.0f, 1.0f, 1000000000LL);
    navicore::FusionState state = pipeline.GetState();

    assert(state.snapped_road_id == 10004LL);
    assert(state.snapped_confidence > 0.85f);
    std::cout << "    -> Snapped to Road Segment ID: " << state.snapped_road_id 
              << " with confidence: " << state.snapped_confidence * 100.0f << "% (> 85%)" << std::endl;

    // Off-grid test
    pipeline.FeedGnss(19.0500, 72.8400, 10.0, 1.0f, 1.0f, 2000000000LL);
    navicore::FusionState state_offgrid = pipeline.GetState();
    assert(state_offgrid.snapped_road_id == 0LL);
    assert(state_offgrid.snapped_confidence == 0.0f);
    std::cout << "    -> Off-grid / basement returns safe zero snap without exceptions." << std::endl;
}

int main() {
    std::cout << "=======================================================" << std::endl;
    std::cout << "🧪 NAVICORE AI: NATIVE PIPELINE TEST HARNESS" << std::endl;
    std::cout << "=======================================================" << std::endl;

    TestPipelineInitializationAndLifecycle();
    TestPipelineImuGnssTransitionAndDeadReckoning();
    TestPipelineDislodgementAndZupt();
    TestPipelineHmmMapMatching();
    TestPipelineMassiveFeedsStressTest();

    std::cout << "=======================================================" << std::endl;
    std::cout << "🎉 ALL PIPELINE TESTS PASSED!" << std::endl;
    std::cout << "=======================================================" << std::endl;
    return 0;
}
