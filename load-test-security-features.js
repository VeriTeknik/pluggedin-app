#!/usr/bin/env node

/**
 * Load Testing Script for Plugged.in Security Features
 * Tests the performance impact of:
 * - Admin role checks and rate limiting
 * - Audit logging under load
 * - Unsubscribe token generation and verification
 * - HMAC operations at scale
 */

import crypto from 'crypto';
import { performance } from 'perf_hooks';

class SecurityFeatureLoadTester {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:12005';
    this.concurrency = options.concurrency || 10;
    this.duration = options.duration || 30000; // 30 seconds
    this.metrics = {
      requests: [],
      errors: [],
      latencies: [],
      throughput: 0,
      errorRate: 0
    };
  }

  /**
   * Simulate HMAC-SHA256 operations like unsubscribe token verification
   */
  async testHMACPerformance(iterations = 10000) {
    console.log(`\n🔐 Testing HMAC-SHA256 Performance (${iterations} iterations)`);

    const secret = 'test-secret-key-for-performance-testing';
    const testData = 'test-token-data-for-hmac-verification';

    const startTime = performance.now();

    for (let i = 0; i < iterations; i++) {
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(testData + i);
      const hash = hmac.digest('hex');

      // Simulate timing-safe comparison
      const expectedHash = crypto.createHmac('sha256', secret);
      expectedHash.update(testData + i);
      const expected = expectedHash.digest('hex');

      crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expected));
    }

    const endTime = performance.now();
    const totalTime = endTime - startTime;
    const avgTime = totalTime / iterations;
    const throughput = (iterations / totalTime) * 1000; // operations per second

    console.log(`  Total Time: ${totalTime.toFixed(2)}ms`);
    console.log(`  Average Time per Operation: ${avgTime.toFixed(4)}ms`);
    console.log(`  Throughput: ${throughput.toFixed(0)} operations/second`);

    return {
      totalTime,
      avgTime,
      throughput,
      operations: iterations
    };
  }

  /**
   * Test token generation performance
   */
  async testTokenGeneration(iterations = 1000) {
    console.log(`\n🎫 Testing Token Generation Performance (${iterations} iterations)`);

    const startTime = performance.now();
    const tokens = [];

    for (let i = 0; i < iterations; i++) {
      const token = crypto.randomBytes(32).toString('base64url');
      tokens.push(token);
    }

    const endTime = performance.now();
    const totalTime = endTime - startTime;
    const avgTime = totalTime / iterations;
    const throughput = (iterations / totalTime) * 1000;

    console.log(`  Total Time: ${totalTime.toFixed(2)}ms`);
    console.log(`  Average Time per Token: ${avgTime.toFixed(4)}ms`);
    console.log(`  Throughput: ${throughput.toFixed(0)} tokens/second`);

    // Check for collisions (should be none with crypto.randomBytes)
    const uniqueTokens = new Set(tokens);
    console.log(`  Unique Tokens: ${uniqueTokens.size}/${iterations} (${((uniqueTokens.size/iterations)*100).toFixed(2)}%)`);

    return {
      totalTime,
      avgTime,
      throughput,
      tokens: iterations,
      uniqueTokens: uniqueTokens.size
    };
  }

  /**
   * Simulate rate limiter memory usage patterns
   */
  async testRateLimiterMemoryUsage(userCount = 1000, requestsPerUser = 10) {
    console.log(`\n📊 Testing Rate Limiter Memory Usage (${userCount} users, ${requestsPerUser} requests each)`);

    const rateLimiterData = new Map();
    const startTime = performance.now();
    const initialMemory = process.memoryUsage();

    // Simulate rate limiter storage
    for (let userId = 0; userId < userCount; userId++) {
      const userKey = `user_${userId}`;

      for (let request = 0; request < requestsPerUser; request++) {
        if (!rateLimiterData.has(userKey)) {
          rateLimiterData.set(userKey, {
            points: 0,
            lastReset: Date.now(),
            requests: []
          });
        }

        const userData = rateLimiterData.get(userKey);
        userData.points += 1;
        userData.requests.push({
          timestamp: Date.now(),
          ip: `192.168.1.${(userId % 254) + 1}`,
          userAgent: `TestAgent-${userId}`
        });
      }
    }

    const endTime = performance.now();
    const finalMemory = process.memoryUsage();

    const memoryIncrease = {
      heapUsed: finalMemory.heapUsed - initialMemory.heapUsed,
      heapTotal: finalMemory.heapTotal - initialMemory.heapTotal,
      external: finalMemory.external - initialMemory.external
    };

    const avgMemoryPerUser = memoryIncrease.heapUsed / userCount;

    console.log(`  Processing Time: ${(endTime - startTime).toFixed(2)}ms`);
    console.log(`  Memory Increase:`);
    console.log(`    Heap Used: ${(memoryIncrease.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`    Heap Total: ${(memoryIncrease.heapTotal / 1024 / 1024).toFixed(2)} MB`);
    console.log(`    External: ${(memoryIncrease.external / 1024).toFixed(2)} KB`);
    console.log(`  Average Memory per User: ${(avgMemoryPerUser / 1024).toFixed(2)} KB`);
    console.log(`  Total Rate Limiter Entries: ${rateLimiterData.size}`);

    // Cleanup
    rateLimiterData.clear();

    return {
      processingTime: endTime - startTime,
      memoryIncrease,
      avgMemoryPerUser,
      totalEntries: userCount
    };
  }

  /**
   * Simulate audit log write performance
   */
  async testAuditLogPerformance(logEntries = 1000) {
    console.log(`\n📝 Testing Audit Log Write Performance (${logEntries} entries)`);

    const auditLogs = [];
    const startTime = performance.now();

    for (let i = 0; i < logEntries; i++) {
      const logEntry = {
        id: crypto.randomUUID(),
        adminId: `admin_${i % 10}`, // 10 different admins
        action: ['send_email', 'user_update', 'server_config', 'bulk_operation'][i % 4],
        targetType: ['user', 'server', 'email', 'config'][i % 4],
        targetId: `target_${i}`,
        details: {
          operation: `test_operation_${i}`,
          timestamp: new Date().toISOString(),
          metadata: {
            ipAddress: `192.168.1.${(i % 254) + 1}`,
            userAgent: `TestAgent-${i}`,
            requestId: crypto.randomUUID()
          }
        },
        ipAddress: `192.168.1.${(i % 254) + 1}`,
        userAgent: `TestAgent-${i}`,
        createdAt: new Date()
      };

      // Simulate JSON serialization overhead
      const serialized = JSON.stringify(logEntry);
      auditLogs.push(serialized);
    }

    const endTime = performance.now();
    const totalTime = endTime - startTime;
    const avgTime = totalTime / logEntries;
    const throughput = (logEntries / totalTime) * 1000;

    const totalSize = auditLogs.reduce((sum, log) => sum + log.length, 0);
    const avgSize = totalSize / logEntries;

    console.log(`  Total Time: ${totalTime.toFixed(2)}ms`);
    console.log(`  Average Time per Entry: ${avgTime.toFixed(4)}ms`);
    console.log(`  Throughput: ${throughput.toFixed(0)} entries/second`);
    console.log(`  Total Data Size: ${(totalSize / 1024).toFixed(2)} KB`);
    console.log(`  Average Entry Size: ${avgSize.toFixed(0)} bytes`);

    return {
      totalTime,
      avgTime,
      throughput,
      entries: logEntries,
      totalSize,
      avgSize
    };
  }

  /**
   * Test concurrent admin role checks
   */
  async testAdminRoleCheckPerformance(concurrentChecks = 100, iterations = 10) {
    console.log(`\n👤 Testing Admin Role Check Performance (${concurrentChecks} concurrent, ${iterations} iterations each)`);

    const adminUsers = Array.from({ length: 10 }, (_, i) => ({
      id: `admin_${i}`,
      email: `admin${i}@test.com`,
      isAdmin: i < 5, // 50% are admins
      requires2fa: i < 3 // 30% require 2FA
    }));

    const startTime = performance.now();
    const results = [];

    const promises = Array.from({ length: concurrentChecks }, async (_, checkId) => {
      const checkResults = [];

      for (let i = 0; i < iterations; i++) {
        const checkStart = performance.now();
        const user = adminUsers[Math.floor(Math.random() * adminUsers.length)];

        // Simulate database lookup and validation
        const isAuthorized = user.isAdmin && (user.requires2fa ? Math.random() > 0.1 : true);

        const checkEnd = performance.now();
        checkResults.push({
          duration: checkEnd - checkStart,
          authorized: isAuthorized,
          userId: user.id
        });
      }

      return checkResults;
    });

    const allResults = await Promise.all(promises);
    const flatResults = allResults.flat();

    const endTime = performance.now();
    const totalTime = endTime - startTime;

    const durations = flatResults.map(r => r.duration);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const maxDuration = Math.max(...durations);
    const minDuration = Math.min(...durations);
    const p95Duration = durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.95)];

    const authorizedCount = flatResults.filter(r => r.authorized).length;
    const totalChecks = flatResults.length;

    console.log(`  Total Time: ${totalTime.toFixed(2)}ms`);
    console.log(`  Total Checks: ${totalChecks}`);
    console.log(`  Average Duration: ${avgDuration.toFixed(4)}ms`);
    console.log(`  Min Duration: ${minDuration.toFixed(4)}ms`);
    console.log(`  Max Duration: ${maxDuration.toFixed(4)}ms`);
    console.log(`  P95 Duration: ${p95Duration.toFixed(4)}ms`);
    console.log(`  Authorization Rate: ${((authorizedCount/totalChecks)*100).toFixed(1)}%`);
    console.log(`  Throughput: ${((totalChecks/totalTime)*1000).toFixed(0)} checks/second`);

    return {
      totalTime,
      totalChecks,
      avgDuration,
      minDuration,
      maxDuration,
      p95Duration,
      authorizationRate: (authorizedCount/totalChecks)*100,
      throughput: (totalChecks/totalTime)*1000
    };
  }

  /**
   * Comprehensive load test
   */
  async runComprehensiveTest() {
    console.log('🚀 COMPREHENSIVE SECURITY FEATURES LOAD TEST');
    console.log('='.repeat(50));

    const results = {};

    try {
      // Test 1: HMAC Performance
      results.hmacPerformance = await this.testHMACPerformance(10000);

      // Test 2: Token Generation
      results.tokenGeneration = await this.testTokenGeneration(1000);

      // Test 3: Rate Limiter Memory Usage
      results.rateLimiterMemory = await this.testRateLimiterMemoryUsage(1000, 10);

      // Test 4: Audit Log Performance
      results.auditLogPerformance = await this.testAuditLogPerformance(1000);

      // Test 5: Admin Role Check Performance
      results.adminRoleChecks = await this.testAdminRoleCheckPerformance(100, 10);

      // Generate summary
      this.generatePerformanceSummary(results);

      return results;

    } catch (error) {
      console.error('❌ Load test failed:', error);
      throw error;
    }
  }

  /**
   * Generate performance summary and recommendations
   */
  generatePerformanceSummary(results) {
    console.log('\n📊 PERFORMANCE SUMMARY');
    console.log('='.repeat(30));

    console.log('\n🎯 Key Metrics:');
    console.log(`  HMAC Throughput: ${results.hmacPerformance.throughput.toFixed(0)} ops/sec`);
    console.log(`  Token Generation: ${results.tokenGeneration.throughput.toFixed(0)} tokens/sec`);
    console.log(`  Admin Check Throughput: ${results.adminRoleChecks.throughput.toFixed(0)} checks/sec`);
    console.log(`  Audit Log Throughput: ${results.auditLogPerformance.throughput.toFixed(0)} entries/sec`);
    console.log(`  Memory per User: ${(results.rateLimiterMemory.avgMemoryPerUser / 1024).toFixed(2)} KB`);

    console.log('\n⏱️  Latency Analysis:');
    console.log(`  HMAC Average: ${results.hmacPerformance.avgTime.toFixed(4)}ms`);
    console.log(`  Token Generation Average: ${results.tokenGeneration.avgTime.toFixed(4)}ms`);
    console.log(`  Admin Check Average: ${results.adminRoleChecks.avgDuration.toFixed(4)}ms`);
    console.log(`  Admin Check P95: ${results.adminRoleChecks.p95Duration.toFixed(4)}ms`);
    console.log(`  Audit Log Average: ${results.auditLogPerformance.avgTime.toFixed(4)}ms`);

    // Performance assessment
    const assessment = this.assessPerformance(results);
    console.log('\n🔍 Performance Assessment:');
    assessment.forEach(item => {
      const icon = item.status === 'good' ? '✅' : item.status === 'warning' ? '⚠️' : '❌';
      console.log(`  ${icon} ${item.metric}: ${item.value} - ${item.comment}`);
    });

    // Recommendations
    const recommendations = this.generateRecommendations(results);
    console.log('\n💡 Recommendations:');
    recommendations.forEach((rec, i) => {
      console.log(`  ${i + 1}. ${rec}`);
    });
  }

  /**
   * Assess performance results
   */
  assessPerformance(results) {
    const assessments = [];

    // HMAC Performance Assessment
    const hmacThroughput = results.hmacPerformance.throughput;
    if (hmacThroughput > 10000) {
      assessments.push({
        metric: 'HMAC Throughput',
        value: `${hmacThroughput.toFixed(0)} ops/sec`,
        status: 'good',
        comment: 'Excellent performance for token verification'
      });
    } else if (hmacThroughput > 5000) {
      assessments.push({
        metric: 'HMAC Throughput',
        value: `${hmacThroughput.toFixed(0)} ops/sec`,
        status: 'warning',
        comment: 'Adequate but monitor under load'
      });
    } else {
      assessments.push({
        metric: 'HMAC Throughput',
        value: `${hmacThroughput.toFixed(0)} ops/sec`,
        status: 'critical',
        comment: 'May become bottleneck under high load'
      });
    }

    // Admin Check Performance
    const adminCheckP95 = results.adminRoleChecks.p95Duration;
    if (adminCheckP95 < 1) {
      assessments.push({
        metric: 'Admin Check P95',
        value: `${adminCheckP95.toFixed(4)}ms`,
        status: 'good',
        comment: 'Fast admin authorization checks'
      });
    } else if (adminCheckP95 < 5) {
      assessments.push({
        metric: 'Admin Check P95',
        value: `${adminCheckP95.toFixed(4)}ms`,
        status: 'warning',
        comment: 'Consider caching admin status'
      });
    } else {
      assessments.push({
        metric: 'Admin Check P95',
        value: `${adminCheckP95.toFixed(4)}ms`,
        status: 'critical',
        comment: 'Admin checks are too slow'
      });
    }

    // Memory Usage Assessment
    const memoryPerUser = results.rateLimiterMemory.avgMemoryPerUser / 1024; // KB
    if (memoryPerUser < 2) {
      assessments.push({
        metric: 'Memory per User',
        value: `${memoryPerUser.toFixed(2)} KB`,
        status: 'good',
        comment: 'Efficient memory usage'
      });
    } else if (memoryPerUser < 5) {
      assessments.push({
        metric: 'Memory per User',
        value: `${memoryPerUser.toFixed(2)} KB`,
        status: 'warning',
        comment: 'Monitor memory usage at scale'
      });
    } else {
      assessments.push({
        metric: 'Memory per User',
        value: `${memoryPerUser.toFixed(2)} KB`,
        status: 'critical',
        comment: 'High memory usage, consider Redis'
      });
    }

    return assessments;
  }

  /**
   * Generate recommendations based on performance results
   */
  generateRecommendations(results) {
    const recommendations = [];

    const memoryPerUser = results.rateLimiterMemory.avgMemoryPerUser / 1024;
    if (memoryPerUser > 2) {
      recommendations.push('Consider implementing Redis-based rate limiting for better memory efficiency');
    }

    const adminCheckP95 = results.adminRoleChecks.p95Duration;
    if (adminCheckP95 > 1) {
      recommendations.push('Cache admin status in user sessions to reduce database queries');
    }

    const auditThroughput = results.auditLogPerformance.throughput;
    if (auditThroughput < 5000) {
      recommendations.push('Implement asynchronous audit logging to prevent blocking operations');
    }

    const hmacThroughput = results.hmacPerformance.throughput;
    if (hmacThroughput < 10000) {
      recommendations.push('Monitor HMAC performance under production load and consider caching verified tokens');
    }

    recommendations.push('Implement database connection pooling for better concurrent performance');
    recommendations.push('Set up monitoring for all security operation metrics in production');
    recommendations.push('Consider batching audit log writes for improved database performance');

    return recommendations;
  }
}

// Run the load test
if (import.meta.url === `file://${process.argv[1]}`) {
  const loadTester = new SecurityFeatureLoadTester({
    concurrency: 10,
    duration: 30000
  });

  loadTester.runComprehensiveTest()
    .then(results => {
      console.log('\n✅ Load testing completed successfully');
      console.log('📄 Results saved to memory for analysis');
    })
    .catch(error => {
      console.error('❌ Load testing failed:', error);
      process.exit(1);
    });
}

export default SecurityFeatureLoadTester;