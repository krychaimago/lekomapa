import React, { useState } from "react";
import { Mail, Send } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { PASSWORD_RECOVERY_COPY } from "@/lib/copy/password-recovery";

const copy = PASSWORD_RECOVERY_COPY.forgotPassword;
const messages = PASSWORD_RECOVERY_COPY.validation;

interface Props {
  serverError?: string | null;
}

export default function ForgotPasswordForm({ serverError }: Props) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();

  function validate() {
    let next: string | undefined;
    if (!email.trim()) {
      next = messages.emailRequired;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next = messages.emailInvalid;
    }
    setError(next);
    return next === undefined;
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  return (
    <form
      method="POST"
      action="/api/auth/password-reset-request"
      className="space-y-4"
      onSubmit={handleSubmit}
      noValidate
    >
      <FormField
        id="email"
        type="email"
        label={copy.emailLabel}
        value={email}
        onChange={(v) => {
          setEmail(v);
          if (error) setError(undefined);
        }}
        placeholder={copy.emailPlaceholder}
        autoComplete="email"
        error={error}
        icon={<Mail className="size-4" />}
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText={copy.pending} icon={<Send className="size-4" />}>
        {copy.submit}
      </SubmitButton>
    </form>
  );
}
