import React, { useState } from "react";
import { KeyRound, Lock } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { MIN_PASSWORD_LENGTH, PASSWORD_RECOVERY_COPY } from "@/lib/copy/password-recovery";

const copy = PASSWORD_RECOVERY_COPY.resetPassword;
const messages = PASSWORD_RECOVERY_COPY.validation;

interface Props {
  serverError?: string | null;
}

export default function ResetPasswordForm({ serverError }: Props) {
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; passwordConfirm?: string }>({});

  function validate() {
    const next: typeof errors = {};

    if (!password) {
      next.password = messages.passwordRequired;
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      next.password = messages.passwordTooShort;
    }

    if (!passwordConfirm) {
      next.passwordConfirm = messages.confirmRequired;
    } else if (password !== passwordConfirm) {
      next.passwordConfirm = messages.mismatch;
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
    }
  }

  return (
    <form method="POST" action="/api/auth/password-update" className="space-y-4" onSubmit={handleSubmit} noValidate>
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
        hint={<p className="text-muted-foreground mt-1 text-sm">{copy.hint}</p>}
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
        id="password_confirm"
        label={copy.confirmLabel}
        type={showPasswordConfirm ? "text" : "password"}
        value={passwordConfirm}
        onChange={(v) => {
          setPasswordConfirm(v);
          clearError("passwordConfirm");
        }}
        autoComplete="new-password"
        error={errors.passwordConfirm}
        icon={<Lock className="size-4" />}
        endContent={
          <PasswordToggle
            visible={showPasswordConfirm}
            onToggle={() => {
              setShowPasswordConfirm(!showPasswordConfirm);
            }}
          />
        }
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText={copy.pending} icon={<KeyRound className="size-4" />}>
        {copy.submit}
      </SubmitButton>
    </form>
  );
}
