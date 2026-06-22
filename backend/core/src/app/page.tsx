import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h1 className="text-4xl font-bold mb-8">Welcome to Core</h1>
      <Button asChild>
        <Link href="http://localhost:8000/api/v1/auth/login/google">
          Googleでログイン
        </Link>
      </Button>
    </div>
  );
}
