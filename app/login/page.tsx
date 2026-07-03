import AuthForm from "@/components/AuthForm";
import { login } from "@/app/actions/auth";

export default function LoginPage() {
  return <AuthForm mode="login" action={login} />;
}
