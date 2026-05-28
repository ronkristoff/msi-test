import { z } from "zod";
import { isValidAppUrl } from "./urls";
import { NAME_MAX, PASSWORD_MIN } from "../../convex/lib/constraints";

export const loginFormSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  password: z.string().min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`),
  firstName: z.string(),
  lastName: z.string(),
});

export const signupSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  password: z.string().min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`),
  firstName: z.string().min(1, "First name is required").max(NAME_MAX, `First name must be under ${NAME_MAX} characters`),
  lastName: z.string().min(1, "Last name is required").max(NAME_MAX, `Last name must be under ${NAME_MAX} characters`),
});

export type LoginValues = z.infer<typeof loginFormSchema>;
export type SignupValues = z.infer<typeof signupSchema>;

export const workspaceNameSchema = z.object({
  name: z.string().trim().min(1, "Please enter a workspace name").max(NAME_MAX, `Workspace name must be under ${NAME_MAX} characters`),
});

export type WorkspaceNameValues = z.infer<typeof workspaceNameSchema>;

export const aiConfigSchema = z.object({
  endpoint_url: z.string().min(1, "Please enter a valid endpoint URL").url("Invalid endpoint URL"),
  api_key: z.string().min(1, "Please enter an API key"),
  model_name: z.string().min(1, "Model name is required"),
});

export type AIConfigFormValues = z.infer<typeof aiConfigSchema>;

export const workspaceSettingsSchema = z.object({
  name: z.string().trim().min(1, "Workspace name is required").max(NAME_MAX, `Workspace name must be under ${NAME_MAX} characters`),
});

export type WorkspaceSettingsValues = z.infer<typeof workspaceSettingsSchema>;

export const accountSchema = z.object({
  name: z.string().min(1, "Name is required").max(NAME_MAX, `Name must be under ${NAME_MAX} characters`),
  email: z.string().email(),
  currentPassword: z.string().optional(),
  newPassword: z.string().optional(),
}).refine(
  (data) => {
    if (data.currentPassword && !data.newPassword) return false;
    if (!data.currentPassword && data.newPassword && data.newPassword.length < PASSWORD_MIN) return false;
    return true;
  },
  { message: `New password must be at least ${PASSWORD_MIN} characters`, path: ["newPassword"] },
);

export type AccountValues = z.infer<typeof accountSchema>;

export const projectBaseSchema = z.object({
  name: z.string().trim().min(1, "Project name is required").max(NAME_MAX, `Project name must be under ${NAME_MAX} characters`),
  app_url: z.string().min(1, "App URL is required").refine(isValidAppUrl, "Please enter a valid URL"),
});

export const projectStep1Schema = projectBaseSchema;
export type ProjectStep1Values = z.infer<typeof projectStep1Schema>;

export const projectSettingsSchema = projectBaseSchema;
export type ProjectSettingsValues = z.infer<typeof projectSettingsSchema>;
