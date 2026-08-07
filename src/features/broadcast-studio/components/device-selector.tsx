import type { StudioDevice } from "../client/media-devices";

type DeviceSelectorProps = Readonly<{
  id: string;
  label: string;
  devices: StudioDevice[];
  value: string;
  disabled?: boolean;
  onChange(value: string): void;
}>;

export function DeviceSelector({
  id,
  label,
  devices,
  value,
  disabled,
  onChange,
}: DeviceSelectorProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled || devices.length === 0}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground disabled:opacity-50"
      >
        {devices.length === 0 ? <option value="">No devices found</option> : null}
        {devices.map((device) => (
          <option key={device.id} value={device.id}>
            {device.label}
          </option>
        ))}
      </select>
    </div>
  );
}
