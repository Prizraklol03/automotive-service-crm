import * as React from "react";

import { cn } from "@/shared/lib/cn";
import { formatPhoneNumber, getPhoneNationalDigits } from "@/shared/lib/phone";

type PhoneInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  onChange: (value: string) => void;
  value: string;
};

function formatFromNationalDigits(nationalDigits: string): string {
  if (!nationalDigits) {
    return "";
  }

  return formatPhoneNumber(`7${nationalDigits}`);
}

export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(({ className, onChange, value, ...props }, forwardedRef) => {
  const innerRef = React.useRef<HTMLInputElement | null>(null);
  React.useImperativeHandle(forwardedRef, () => innerRef.current as HTMLInputElement);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const key = event.key;
    const currentNationalDigits = getPhoneNationalDigits(value);
    const trimmedValue = value.trim();

    if (key === "+") {
      event.preventDefault();
      if (!trimmedValue) {
        onChange("+");
      }
      return;
    }

    if (/^\d$/.test(key)) {
      event.preventDefault();

      if (trimmedValue === "+") {
        if (key === "7") {
          onChange("+7");
          return;
        }
        onChange(formatFromNationalDigits(key));
        return;
      }

      if (!trimmedValue && !currentNationalDigits && (key === "7" || key === "8")) {
        onChange("+7");
        return;
      }

      const nextNationalDigits = `${currentNationalDigits}${key}`.slice(0, 10);
      onChange(formatFromNationalDigits(nextNationalDigits));
      return;
    }

    if (key === "Backspace" || key === "Delete") {
      event.preventDefault();
      if (trimmedValue === "+") {
        onChange("");
        return;
      }
      onChange(formatFromNationalDigits(currentNationalDigits.slice(0, -1)));
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    onChange(formatPhoneNumber(event.clipboardData.getData("text")));
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange(formatPhoneNumber(event.target.value));
  };

  return (
    <input
      {...props}
      ref={innerRef}
      inputMode="tel"
      autoComplete="tel"
      value={formatPhoneNumber(value)}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      className={cn(
        "flex h-11 w-full rounded-xl border border-input bg-surface px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm",
        className
      )}
    />
  );
});

PhoneInput.displayName = "PhoneInput";
