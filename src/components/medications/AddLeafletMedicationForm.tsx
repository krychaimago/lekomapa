import { Save } from "lucide-react";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { useSubmitting } from "@/components/hooks/useSubmitting";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MEDICATION_COPY } from "@/lib/copy/medications";

const copy = MEDICATION_COPY.add;
const leafletCopy = MEDICATION_COPY.leaflet;
const formCopy = MEDICATION_COPY.form;
const SUBSTANCE_LIST_ID = "substance-names";
const MAX_TEXT_LENGTH = 200;

interface Props {
  // Dictionary names with an ATC code (registry_substances.normalized_name), offered by the browser's datalist.
  substanceNames: string[];
  productName: string;
  substanceName: string;
  startedOn: string;
  // `YYYY-MM-DD` in Europe/Warsaw: upper bound of the start date.
  today: string;
  // True in the "no match" state: the typed substance is not in the dictionary, so the form offers the
  // "save without checking" checkbox. Without it ticked, the route never saves a substance without a code.
  showConfirmUnverified: boolean;
  serverError?: string | null;
}

// Native POST form: fields and the checkbox work without JavaScript. React only disables the button after the first
// submit, so a double click cannot save the same medication twice.
export default function AddLeafletMedicationForm({
  substanceNames,
  productName,
  substanceName,
  startedOn,
  today,
  showConfirmUnverified,
  serverError,
}: Props) {
  const [submitting, markSubmitting] = useSubmitting();

  return (
    <Card>
      <CardContent>
        <form method="POST" action="/api/medications" className="flex flex-col gap-6" onSubmit={markSubmitting}>
          <input type="hidden" name="source" value="leaflet" />

          <div className="flex flex-col gap-2">
            <Label htmlFor="productName">
              {leafletCopy.productNameLabel}{" "}
              <span className="text-muted-foreground font-normal">{formCopy.requiredMark}</span>
            </Label>
            <Input
              id="productName"
              name="productName"
              defaultValue={productName}
              maxLength={MAX_TEXT_LENGTH}
              required
              autoComplete="off"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="substanceName">
              {leafletCopy.substanceLabel}{" "}
              <span className="text-muted-foreground font-normal">{formCopy.requiredMark}</span>
            </Label>
            <Input
              id="substanceName"
              name="substanceName"
              list={SUBSTANCE_LIST_ID}
              defaultValue={substanceName}
              maxLength={MAX_TEXT_LENGTH}
              required
              autoComplete="off"
              aria-describedby="substanceName-hint"
            />
            <datalist id={SUBSTANCE_LIST_ID}>
              {substanceNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <p id="substanceName-hint" className="text-muted-foreground text-sm">
              {leafletCopy.substanceHint} {leafletCopy.substanceListHint}
            </p>
          </div>

          {showConfirmUnverified && (
            <label className="border-border flex cursor-pointer items-start gap-3 rounded-lg border p-4">
              <input
                type="checkbox"
                name="confirmUnverified"
                value="1"
                className="accent-primary mt-1 size-5 shrink-0"
              />
              <span>{leafletCopy.confirmUnverified}</span>
            </label>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="doseText">
              {copy.doseLabel} <span className="text-muted-foreground font-normal">{formCopy.requiredMark}</span>
            </Label>
            <Input
              id="doseText"
              name="doseText"
              maxLength={MAX_TEXT_LENGTH}
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
            <Input id="startedOn" name="startedOn" type="date" defaultValue={startedOn} max={today} required />
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
