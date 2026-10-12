import { Save } from "lucide-react";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { useSubmitting } from "@/components/hooks/useSubmitting";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MEDICATION_COPY } from "@/lib/copy/medications";
import type { RegistryVariantOption } from "@/types";

const copy = MEDICATION_COPY.add;
const formCopy = MEDICATION_COPY.form;

interface Props {
  variants: RegistryVariantOption[];
  selectedId: string;
  // `YYYY-MM-DD` in Europe/Warsaw: default and upper bound of the start date.
  today: string;
  serverError?: string | null;
}

// Native POST form: radios and fields work without JavaScript. React only disables the button after the first
// submit, so a double click cannot save the same medication twice.
export default function AddMedicationForm({ variants, selectedId, today, serverError }: Props) {
  const [submitting, markSubmitting] = useSubmitting();

  return (
    <Card>
      <CardContent>
        <form method="POST" action="/api/medications" className="flex flex-col gap-6" onSubmit={markSubmitting}>
          <input type="hidden" name="source" value="registry" />

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-3 text-lg font-semibold">
              {copy.chooseVariant} <span className="text-muted-foreground font-normal">{formCopy.requiredMark}</span>
            </legend>
            {variants.map((variant) => (
              <label
                key={variant.id}
                className="border-border has-[:checked]:border-primary has-[:checked]:ring-primary flex cursor-pointer items-start gap-3 rounded-lg border p-4 has-[:checked]:ring-2"
              >
                <input
                  type="radio"
                  name="registryProductId"
                  value={variant.id}
                  defaultChecked={variant.id === selectedId}
                  required
                  className="accent-primary mt-1 size-5 shrink-0"
                />
                <span className="flex flex-col gap-1">
                  <span>
                    {copy.strength}: {variant.strength ?? "—"} · {copy.form}: {variant.form ?? "—"}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {copy.composition}:{" "}
                    {variant.composition.length > 0 ? variant.composition.join(", ") : copy.compositionUnknown}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="flex flex-col gap-2">
            <Label htmlFor="doseText">
              {copy.doseLabel} <span className="text-muted-foreground font-normal">{formCopy.requiredMark}</span>
            </Label>
            <Input
              id="doseText"
              name="doseText"
              maxLength={200}
              required
              autoComplete="off"
              aria-describedby="doseText-hint"
            />
            <p id="doseText-hint" className="text-muted-foreground text-sm">
              {copy.doseHint}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="startedOn">
              {copy.startedOnLabel} <span className="text-muted-foreground font-normal">{formCopy.requiredMark}</span>
            </Label>
            <Input id="startedOn" name="startedOn" type="date" defaultValue={today} max={today} required />
          </div>

          <ServerError message={serverError} />

          <SubmitButton pending={submitting} pendingText={copy.pending} icon={<Save className="size-4" />}>
            {copy.submit}
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
