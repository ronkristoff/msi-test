import { z } from "zod";

export const loginFormSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string(),
  lastName: z.string(),
});

export const signupSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1, "First name is required").max(100, "First name must be under 100 characters"),
  lastName: z.string().min(1, "Last name is required").max(100, "Last name must be under 100 characters"),
});

export type LoginValues = z.infer<typeof loginFormSchema>;
export type SignupValues = z.infer<typeof signupSchema>;

export const workspaceNameSchema = z.object({
  name: z.string().min(1, "Please enter a workspace name").max(100, "Workspace name must be under 100 characters"),
});

export type WorkspaceNameValues = z.infer<typeof workspaceNameSchema>;

export const aiConfigSchema = z.object({
  endpoint_url: z.string().min(1, "Please enter a valid endpoint URL").url("Invalid endpoint URL"),
  api_key: z.string().min(1, "Please enter an API key"),
  model_name: z.string().min(1, "Model name is required"),
});

export type AIConfigFormValues = z.infer<typeof aiConfigSchema>;

export const workspaceSettingsSchema = z.object({
  name: z.string().min(1, "Workspace name is required").max(100, "Workspace name must be under 100 characters"),
});

export type WorkspaceSettingsValues = z.infer<typeof workspaceSettingsSchema>;

export const accountSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be under 100 characters"),
  email: z.string().email(),
  currentPassword: z.string().optional(),
  newPassword: z.string().optional(),
}).refine(
  (data) => {
    if (data.currentPassword && !data.newPassword) return false;
    if (!data.currentPassword && data.newPassword && data.newPassword.length < 8) return false;
    return true;
  },
  { message: "New password must be at least 8 characters", path: ["newPassword"] },
);

export type AccountValues = z.infer<typeof accountSchema>;

export const projectBaseSchema = z.object({
  name: z.string().min(1, "Project name is required").max(100, "Project name must be under 100 characters"),
  app_url: z.string().min(1, "App URL is required").refine(
    (val) => { try { new URL(/^https?:\/\//i.test(val) ? val : `https://${val}`); return true; } catch { return false; } },
    "Please enter a valid URL",
  ),
});

export const projectStep1Schema = projectBaseSchema;
export type ProjectStep1Values = z.infer<typeof projectStep1Schema>;

export const projectSettingsSchema = projectBaseSchema;
export type ProjectSettingsValues = z.infer<typeof projectSettingsSchema>;
