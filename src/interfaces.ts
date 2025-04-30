export type TextOptions = {
	ignoreAccents: boolean;
	lowerCase: boolean;
};

type AreaSettings = {
	fields: string[];
} & TextOptions;

export interface DataviewPropertiesSettings {
	dql: boolean;
	djs: boolean;
	/**
	 * Ignore the following fields
	 */
	ignoreFields: AreaSettings;
	cleanUpText: AreaSettings;
}

export const DEFAULT_SETTINGS: DataviewPropertiesSettings = {
	dql: true,
	djs: true,
	ignoreFields: {
		fields: [],
		lowerCase: true,
		ignoreAccents: true,
	},
	cleanUpText: {
		fields: [],
		lowerCase: true,
		ignoreAccents: true,
	},
};
