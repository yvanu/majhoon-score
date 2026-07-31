declare const __dirname: string

declare const require: {
  (id: string): any
}

declare const process: {
  env: Record<string, string | undefined>
}

declare function defineAppConfig<T>(config: T): T
declare function definePageConfig<T>(config: T): T
