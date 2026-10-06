import { useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PasswordField({
  id,
  rotulo = "Senha",
  value,
  onChange,
  autoComplete,
  required,
  placeholder,
  children,
}: {
  id: string;
  rotulo?: string;
  value: string;
  onChange: (valor: string) => void;
  autoComplete?: string;
  required?: boolean;
  placeholder?: string;
  children?: ReactNode;
}) {
  const [visivel, setVisivel] = useState(false);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{rotulo}</Label>
        <button
          type="button"
          onClick={() => setVisivel((v) => !v)}
          className="text-muted-foreground transicao-suave hover:text-foreground"
          aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={visivel}
        >
          {visivel ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>
      <Input
        id={id}
        type={visivel ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        placeholder={placeholder}
      />
      {children}
    </div>
  );
}
