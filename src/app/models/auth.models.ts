export interface RegisterResponse {
  success: boolean;
  message: string;
}

export interface LoginResponse {
  token?: string;
  userid?: number;
  firstname?: string;
  lastname?: string;
  email: string;
  avatarPath?: string;
  timezone?: string;
  requiresPasscode?: boolean;
  challengeId?: string;
  deviceToken?: string;
}

export interface UploadAvatarResponse {
  success: boolean;
  avatarPath: string;
}

export interface ForgotPasswordResponse {
  success: boolean;
  message: string;
}

export interface VerifyOtpResponse {
  valid: boolean;
  message: string;
  token: string;
  jwt?: string;
  userid?: number;
  firstname?: string;
  lastname?: string;
  email?: string;
}

export interface ResetPasswordResponse {
  valid: boolean;
}

export interface UpdateProfileRequest {
  email: string;
  firstname: string;
  lastname: string;
  phone: string;
  organization: string;
  timezone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  currentPw?: string;
  newPw?: string;
}

export interface ProfileResponse {
  success: boolean;
  profile: {
    firstname: string;
    lastname: string;
    email: string;
    phone: string;
    organization: string;
    timezone: string;
    notifPref: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    memberSince: string;
    activeProjectCount: number;
    accountRole: string;
  };
}

export interface UpdateProfileResponse {
  success: boolean;
  message: string;
}

export interface DeleteAccountResponse {
  success: boolean;
  message?: string;
}
