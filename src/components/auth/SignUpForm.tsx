import React, { useState } from "react";
import { Mail, Lock, UserPlus } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { useSubmitting } from "@/components/hooks/useSubmitting";
import { TermsCheckbox } from "@/components/auth/TermsCheckbox";
import { AUTH_COPY } from "@/lib/copy/auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/copy/password-recovery";

const copy = AUTH_COPY.signUp;
const validation = AUTH_COPY.validation;

interface Props {
  serverError?: string | null;
}

export default function SignUpForm({ serverError }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitting, markSubmitting] = useSubmitting();
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirmPassword?: string; terms?: string }>(
    {},
  );

  function validate() {
    const next: typeof errors = {};

    if (!email.trim()) {
      next.email = validation.emailRequired;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = validation.emailInvalid;
    }

    if (!password) {
      next.password = validation.passwordRequired;
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      next.password = validation.passwordTooShort;
    }

    if (!confirmPassword) {
      next.confirmPassword = validation.confirmRequired;
    } else if (password !== confirmPassword) {
      next.confirmPassword = AUTH_COPY.errors.password_mismatch;
    }

    if (!termsAccepted) {
      next.terms = AUTH_COPY.errors.terms;
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function clearError(field: keyof typeof errors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
      return;
    }
    markSubmitting();
  }

  const passwordHint = <p className="text-muted-foreground mt-1 text-sm">{copy.passwordHint}</p>;

  return (
    <form method="POST" action="/api/auth/signup" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="email"
        type="email"
        label={copy.emailLabel}
        value={email}
        onChange={(v) => {
          setEmail(v);
          clearError("email");
        }}
        placeholder={copy.emailPlaceholder}
        autoComplete="email"
        error={errors.email}
        icon={<Mail className="size-4" />}
      />

      <FormField
        id="password"
        label={copy.passwordLabel}
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={(v) => {
          setPassword(v);
          clearError("password");
        }}
        autoComplete="new-password"
        error={errors.password}
        hint={passwordHint}
        icon={<Lock className="size-4" />}
        endContent={
          <PasswordToggle
            visible={showPassword}
            onToggle={() => {
              setShowPassword(!showPassword);
            }}
          />
        }
      />

      <FormField
        id="confirmPassword"
        name="confirmPassword"
        label={copy.confirmLabel}
        type={showConfirmPassword ? "text" : "password"}
        value={confirmPassword}
        onChange={(v) => {
          setConfirmPassword(v);
          clearError("confirmPassword");
        }}
        autoComplete="new-password"
        error={errors.confirmPassword}
        icon={<Lock className="size-4" />}
        endContent={
          <PasswordToggle
            visible={showConfirmPassword}
            onToggle={() => {
              setShowConfirmPassword(!showConfirmPassword);
            }}
          />
        }
      />

      <TermsCheckbox
        checked={termsAccepted}
        onChange={(checked) => {
          setTermsAccepted(checked);
          clearError("terms");
        }}
        error={errors.terms}
      />

      <ServerError message={serverError} />

      <SubmitButton pending={submitting} pendingText={copy.pending} icon={<UserPlus className="size-4" />}>
        {copy.submit}
      </SubmitButton>
    </form>
  );
}
