import { randomUUID } from 'crypto';

/**
 * Approval system for MCP tool calls
 * Compatible with OpenAI's approval workflow requirements
 */
export class MCPApprovalSystem {
  private static instance: MCPApprovalSystem;
  private approvals: Map<string, ApprovalRequest> = new Map();
  private approvalCallbacks: Map<string, (approved: boolean, reason?: string) => void> = new Map();

  private constructor() {}

  static getInstance(): MCPApprovalSystem {
    if (!MCPApprovalSystem.instance) {
      MCPApprovalSystem.instance = new MCPApprovalSystem();
    }
    return MCPApprovalSystem.instance;
  }

  /**
   * Request approval for a tool call
   */
  async requestApproval(
    request: ApprovalRequest
  ): Promise<ApprovalResponse> {
    const approvalId = randomUUID();
    const approval: ApprovalRequest = {
      ...request,
      id: approvalId,
      status: 'pending',
      createdAt: new Date(),
    };

    this.approvals.set(approvalId, approval);

    try {
      // Log the approval request
      console.log(`Approval requested for tool call: ${request.toolName}`, approval);

      // For now, auto-approve in development mode
      // In a real implementation, this would send notifications or wait for user input
      const autoApprove = process.env.NODE_ENV === 'development' || request.autoApprove;

      if (autoApprove) {
        return this.approve(approvalId, 'Auto-approved in development mode');
      }

      // In production, this would wait for user approval
      // For now, we'll return a pending response
      return {
        approved: false,
        approvalId,
        status: 'pending',
        message: 'Approval required for tool execution',
      };
    } catch (error) {
      console.error('Error requesting approval:', error);
      return {
        approved: false,
        approvalId,
        status: 'error',
        message: `Error requesting approval: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Approve a tool call
   */
  approve(approvalId: string, reason?: string): ApprovalResponse {
    const approval = this.approvals.get(approvalId);
    if (!approval) {
      return {
        approved: false,
        approvalId,
        status: 'error',
        message: 'Approval request not found',
      };
    }

    approval.status = 'approved';
    approval.approvedAt = new Date();
    approval.reason = reason;

    // Trigger callback if registered
    const callback = this.approvalCallbacks.get(approvalId);
    if (callback) {
      callback(true, reason);
      this.approvalCallbacks.delete(approvalId);
    }

    console.log(`Tool call approved: ${approval.toolName}`, { approvalId, reason });

    return {
      approved: true,
      approvalId,
      status: 'approved',
      message: reason || 'Tool call approved',
    };
  }

  /**
   * Reject a tool call
   */
  reject(approvalId: string, reason: string): ApprovalResponse {
    const approval = this.approvals.get(approvalId);
    if (!approval) {
      return {
        approved: false,
        approvalId,
        status: 'error',
        message: 'Approval request not found',
      };
    }

    approval.status = 'rejected';
    approval.rejectedAt = new Date();
    approval.reason = reason;

    // Trigger callback if registered
    const callback = this.approvalCallbacks.get(approvalId);
    if (callback) {
      callback(false, reason);
      this.approvalCallbacks.delete(approvalId);
    }

    console.log(`Tool call rejected: ${approval.toolName}`, { approvalId, reason });

    return {
      approved: false,
      approvalId,
      status: 'rejected',
      message: reason,
    };
  }

  /**
   * Wait for approval (async)
   */
  async waitForApproval(
    approvalId: string,
    timeout: number = 30000 // 30 seconds default
  ): Promise<ApprovalResponse> {
    return new Promise((resolve) => {
      const approval = this.approvals.get(approvalId);
      if (!approval) {
        resolve({
          approved: false,
          approvalId,
          status: 'error',
          message: 'Approval request not found',
        });
        return;
      }

      // Check if already decided
      if (approval.status !== 'pending') {
        resolve({
          approved: approval.status === 'approved',
          approvalId,
          status: approval.status,
          message: approval.reason || `Tool call ${approval.status}`,
        });
        return;
      }

      // Register callback
      this.approvalCallbacks.set(approvalId, (approved: boolean, reason?: string) => {
        resolve({
          approved,
          approvalId,
          status: approved ? 'approved' : 'rejected',
          message: reason || (approved ? 'Tool call approved' : 'Tool call rejected'),
        });
      });

      // Set timeout
      setTimeout(() => {
        if (this.approvalCallbacks.has(approvalId)) {
          this.approvalCallbacks.delete(approvalId);
          this.reject(approvalId, 'Approval timeout');
          resolve({
            approved: false,
            approvalId,
            status: 'timeout',
            message: 'Approval timeout',
          });
        }
      }, timeout);
    });
  }

  /**
   * Get approval status
   */
  getApprovalStatus(approvalId: string): ApprovalRequest | null {
    return this.approvals.get(approvalId) || null;
  }

  /**
   * Get all approvals for a profile
   */
  getApprovalsForProfile(profileUuid: string): ApprovalRequest[] {
    return Array.from(this.approvals.values()).filter(
      approval => approval.profileUuid === profileUuid
    );
  }

  /**
   * Get pending approvals
   */
  getPendingApprovals(): ApprovalRequest[] {
    return Array.from(this.approvals.values()).filter(
      approval => approval.status === 'pending'
    );
  }

  /**
   * Clean up old approvals
   */
  cleanupOldApprovals(maxAge: number = 24 * 60 * 60 * 1000): void { // 24 hours
    const now = Date.now();
    for (const [approvalId, approval] of this.approvals.entries()) {
      if (now - approval.createdAt.getTime() > maxAge) {
        this.approvals.delete(approvalId);
        this.approvalCallbacks.delete(approvalId);
        console.log(`Cleaned up old approval: ${approvalId}`);
      }
    }
  }

  /**
   * Check if a tool requires approval
   */
  requiresApproval(toolName: string, args: any): boolean {
    // Tools that typically require approval
    const sensitiveTools = [
      'filesystem_write',
      'filesystem_delete',
      'database_execute',
      'system_command',
      'network_request',
      'email_send',
      'payment_process',
    ];

    // Check if tool name matches sensitive patterns
    const isSensitive = sensitiveTools.some(pattern => 
      toolName.toLowerCase().includes(pattern.toLowerCase())
    );

    // Check for sensitive arguments
    const hasSensitiveArgs = this.hasSensitiveArguments(args);

    return isSensitive || hasSensitiveArgs;
  }

  /**
   * Check if arguments contain sensitive information
   */
  private hasSensitiveArguments(args: any): boolean {
    if (!args || typeof args !== 'object') {
      return false;
    }

    const sensitivePatterns = [
      /password/i,
      /secret/i,
      /token/i,
      /key/i,
      /credential/i,
      /auth/i,
      /private/i,
      /confidential/i,
    ];

    const checkValue = (value: any): boolean => {
      if (typeof value === 'string') {
        return sensitivePatterns.some(pattern => pattern.test(value));
      }
      if (typeof value === 'object' && value !== null) {
        return Object.values(value).some(checkValue);
      }
      return false;
    };

    return checkValue(args);
  }

  /**
   * Get approval statistics
   */
  getApprovalStats(): {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    timeout: number;
  } {
    const approvals = Array.from(this.approvals.values());
    
    return {
      total: approvals.length,
      pending: approvals.filter(a => a.status === 'pending').length,
      approved: approvals.filter(a => a.status === 'approved').length,
      rejected: approvals.filter(a => a.status === 'rejected').length,
      timeout: approvals.filter(a => a.status === 'timeout').length,
    };
  }
}

/**
 * Approval request interface
 */
export interface ApprovalRequest {
  id: string;
  profileUuid: string;
  toolName: string;
  arguments: Record<string, any>;
  description?: string;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  autoApprove?: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'timeout' | 'error';
  createdAt: Date;
  approvedAt?: Date;
  rejectedAt?: Date;
  reason?: string;
}

/**
 * Approval response interface
 */
export interface ApprovalResponse {
  approved: boolean;
  approvalId: string;
  status: 'approved' | 'rejected' | 'pending' | 'timeout' | 'error';
  message: string;
}