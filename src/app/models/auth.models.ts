export interface RegisterResponse {
  success: boolean;
  message: string;
}

export interface LoginResponse {
  token: string;
  userid: number;
  firstname: string;
  lastname: string;
  email: string;
  avatarPath: string;
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
  timezone: string;
  notifPref: string;
  currentPw?: string;
  newPw?: string;
}

export interface UpdateProfileResponse {
  success: boolean;
  message: string;
}

export interface DeleteAccountResponse {
  success: boolean;
  message?: string;
}
