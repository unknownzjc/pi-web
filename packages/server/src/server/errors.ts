export type ErrorCode =
  | "workspace_not_found"
  | "workspace_invalid"
  | "session_not_found"
  | "session_busy"
  | "runtime_unavailable"
  | "git_unavailable"
  | "path_out_of_workspace"
  | "path_not_found"
  | "path_permission_denied"
  | "internal_error";

export interface ErrorDto {
  code: ErrorCode;
  message: string;
}

export interface OkResponseDto<T> {
  ok: true;
  data: T;
}

export interface ErrorResponseDto {
  ok: false;
  error: ErrorDto;
}

export type ApiResponse<T> = OkResponseDto<T> | ErrorResponseDto;

export function ok<T>(data: T): OkResponseDto<T> {
  return { ok: true, data };
}

export function err(code: ErrorCode, message: string): ErrorResponseDto {
  return { ok: false, error: { code, message } };
}
