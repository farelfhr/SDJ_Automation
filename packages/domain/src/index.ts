// Domain package public API

// Activities
export {
  ACTIVITY_TYPES,
  PRAYER_IDS,
  DEFAULT_ACTIVITIES,
  PRAYER_SCORE_VALUES,
  SCORE_LABELS,
  isValidPrayerScore,
  getPrayerById,
  getAllPrayers,
  getActivityDisplayName,
} from './activities.js';
export type { ActivityType, PrayerId, ActivityId, PrayerScore } from './activities.js';

// Dates
export {
  createDefaultDateContext,
  daysBetween,
  resolveRelativeDate,
  parseExplicitDate,
  resolveDate,
  formatDateId,
  formatDateShort,
  toISODateString,
} from './dates.js';
export type { DateResolution, DateContext } from './dates.js';

// Commands
export {
  COMMAND_ACTIONS,
  createSetScoreCommand,
  createQueryCommand,
  createRecapCommand,
  createUndoCommand,
  createHelpCommand,
  createStatusCommand,
  createUnknownCommand,
  isValidCommand,
  getActionDisplayName,
} from './commands.js';
export type { CommandAction, CommandProposal } from './commands.js';

// Mutations
export {
  MUTATION_TYPES,
  MUTATION_STATUSES,
  createMutation,
  isUndoable,
  canRollback,
} from './mutations.js';
export type {
  MutationType,
  MutationStatus,
  CellPosition,
  TypedCellValue,
  Mutation,
  MutationResult,
} from './mutations.js';

// User
export {
  USER_STATUSES,
  createUser,
  activateUser,
  suspendUser,
  grantConsent,
  isUserActive,
  hasUserConsented,
} from './user.js';
export type { UserStatus, User } from './user.js';

// Channel
export {
  CHANNEL_TYPES,
  createChannelIdentity,
  verifyChannelIdentity,
  updateLastMessage,
} from './channel.js';
export type { ChannelType, ChannelIdentity } from './channel.js';

// Parser
export {
  parseCommand,
  parseMultipleCommands,
  validateParsedCommand,
} from './parser/index.js';
export type { ParseResult } from './parser/index.js';

// Errors
export {
  DomainError,
  ValidationError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  InvalidOperationError,
} from './errors.js';

// Result
export {
  ok,
  err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  map,
  mapErr,
  flatMap,
  okAsync,
  errAsync,
  mapAsync,
} from './result.js';
export type { Ok, Err, Result } from './result.js';
