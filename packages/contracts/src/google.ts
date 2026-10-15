/**
 * Google Integration Schemas
 *
 * Zod schemas for Google OAuth and Sheets operations.
 */

import { z } from 'zod';

// Google connection (OAuth tokens)
export const GoogleConnectionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  accessToken: z.string(),
  refreshToken: z.string(),
  tokenType: z.string().default('Bearer'),
  expiresAt: z.string().datetime(),
  scope: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// Tracker connection (Sheet binding)
export const TrackerConnectionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  googleConnectionId: z.string().uuid(),
  spreadsheetId: z.string(),
  spreadsheetName: z.string(),
  sheetName: z.string().default('Sheet1'),
  dateColumnStart: z.number().int().default(2), // Column B
  activityRowStart: z.number().int().default(3), // Row 3
  isActive: z.boolean().default(true),
  lastSyncAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// Template version
export const TemplateVersionSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  spreadsheetUrl: z.string().url().optional(),
  isDefault: z.boolean().default(false),
  createdAt: z.string().datetime(),
});

// Sheet cell value
export const SheetCellValueSchema = z.object({
  row: z.number().int(),
  column: z.number().int(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});

// Sheet row data
export const SheetRowDataSchema = z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]));

// Google OAuth callback
export const GoogleOAuthCallbackSchema = z.object({
  code: z.string(),
  state: z.string(),
});

// Google Picker configuration
export const GooglePickerConfigSchema = z.object({
  apiKey: z.string(),
  clientId: z.string(),
  scopes: z.array(z.string()),
});

// Type exports
export type GoogleConnection = z.infer<typeof GoogleConnectionSchema>;
export type TrackerConnection = z.infer<typeof TrackerConnectionSchema>;
export type TemplateVersion = z.infer<typeof TemplateVersionSchema>;
export type SheetCellValue = z.infer<typeof SheetCellValueSchema>;
export type SheetRowData = z.infer<typeof SheetRowDataSchema>;
export type GoogleOAuthCallback = z.infer<typeof GoogleOAuthCallbackSchema>;
export type GooglePickerConfig = z.infer<typeof GooglePickerConfigSchema>;
