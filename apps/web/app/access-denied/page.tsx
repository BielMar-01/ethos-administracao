import Link from "next/link";
import { AuthFrame } from "../../components/auth/auth-frame";
export default function AccessDenied() {
  return (
    <AuthFrame
      title="Acesso restrito."
      description="Sua conta não possui permissão para esta área da organização."
    >
      <p className="mb-6 leading-7 text-muted">
        Se precisar deste acesso, fale com o administrador da sua organização.
      </p>
      <div className="flex flex-wrap gap-5 text-sm underline underline-offset-4">
        <Link href="/organizations">Trocar organização</Link>
        <Link href="/account/security">Segurança da conta</Link>
      </div>
    </AuthFrame>
  );
}
