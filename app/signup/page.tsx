import AuthForm from "@/components/AuthForm";
import { signup } from "@/app/actions/auth";

export const metadata = {
  title: "Create your free account",
  description: "Save and revisit your retirement scenarios. Free — general information only, not financial advice.",
};

export default function SignupPage() {
  return <AuthForm mode="signup" action={signup} />;
}
