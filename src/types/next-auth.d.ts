import type { DefaultSession } from "next-auth";
import type { UserRole, UserStatus } from "@/lib/user-fields";

declare module "next-auth" {
  interface Session {
    user: Omit<DefaultSession["user"], "email"> & {
      id: string;
      email?: string | null;
      phone?: string | null;
      role: UserRole;
      status: UserStatus;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    email?: string | null;
    phone?: string | null;
    role?: UserRole;
    status?: UserStatus;
  }
}
