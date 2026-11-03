"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loading } from "@/components/AppShell";

/** The start page: Home on tablets and bigger screens, Games on phones (the dugout view). */
export default function StartPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace(window.matchMedia("(min-width: 768px)").matches ? "/home" : "/games");
  }, [router]);
  return <Loading />;
}
