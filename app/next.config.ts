import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// Locally the secrets live in the repo-root .env; on Vercel they come from project settings.
loadEnvConfig(path.resolve(process.cwd(), ".."), process.env.NODE_ENV !== "production", undefined, true);

const config: NextConfig = {};

export default config;
