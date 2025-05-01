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
	/**
	 * Interval in milliseconds to check for changes in the file
	 */
	interval: number;
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
	interval: 1000,
};
