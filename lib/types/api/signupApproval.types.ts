export type SignupApprovalRequest = {
  email: string;
  status: string;
};

export type SignupApprovalAction = 'approve' | 'reject';

export type SignupApprovalDecisionRequest = {
  token: string;
  action: SignupApprovalAction;
};

export type SignupApprovalDecisionResponse = {
  alreadyRegistered?: boolean;
};
