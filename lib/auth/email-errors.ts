type AuthEmailError = { code?: string; status?: number; message?: string };

export function hideUnknownAuthEmail(error: AuthEmailError) {
  return error.code === "user_not_found" ||
    (error.code === "otp_disabled" && error.message === "Signups not allowed for otp");
}

export function authEmailErrorMessage(error: AuthEmailError) {
  if (error.status === 429 ||
      error.code === "over_email_send_rate_limit" ||
      error.code === "over_request_rate_limit") {
    return "The email limit was reached. Wait before requesting another email.";
  }
  if (error.code === "email_address_not_authorized") {
    return "The demo email service can only send to approved addresses. Use your project team email or contact the demo owner.";
  }
  if (error.code === "otp_disabled" || error.code === "email_provider_disabled") {
    return "Email sign-in links are unavailable. Use your password or confirm your account first.";
  }
  if (error.code === "weak_password") return "Choose a stronger password.";
  if (error.code === "email_address_invalid" || error.code === "validation_failed") {
    return "Enter a valid email address and try again.";
  }
  if (error.code === "signup_disabled") return "New account registration is currently closed.";
  return "The email service could not send this message. Try again in a few minutes.";
}
