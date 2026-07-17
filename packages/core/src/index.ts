export interface ApplicationModule {
  readonly name: string;
}

export function defineModule<const TModule extends ApplicationModule>(module: TModule): TModule {
  if (module.name.trim().length === 0) {
    throw new Error('Application module name must not be empty.');
  }

  return Object.freeze(module);
}

export * from './identity/index';
