import AuthForm from "@/components/AuthForm";
import { signup } from "@/app/actions/auth";
import { googleConfigured } from "@/lib/googleAuth";

export const metadata = {
  title: "Create your free account",
  description: "Save and revisit your retirement scenarios. Free — general information only, not financial advice.",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <AuthForm mode="signup" action={signup} googleEnabled={googleConfigured()} oauthError={error ?? null} />
  );
}
