export type TextOptions = {
	ignoreAccents: boolean;
	lowerCase: boolean;
};

export interface PreparedFields {
	keys: Set<string>;
	regex: RegExp[];
}
type AreaSettings = {
	fields: string[];
} & TextOptions;

export interface DataviewPropertiesSettings {
	prefix: string;
	dql: boolean;
	djs: boolean;
	/**
	 * Mark some field name as a list, as sometimes they are not recognized as a list but as a string by DV.
	 * Also, the suffix `_list` can be added for the same purpose, without registering the field as a list.
	 */
	listFields: AreaSettings;
	/**
	 * Ignore the following fields
	 */
	ignoreFields: AreaSettings;
	cleanUpText: AreaSettings;
	/**
	 * Interval in milliseconds to check for changes in the file
	 */
	interval: number;
	deleteFromFrontmatter: {
		enabled: boolean;
	} & TextOptions;
}

export enum UtilsConfig {
	Default = "default",
	Ignore = "ignore",
	Cleanup = "cleanup",
	Delete = "delete",
	Lists = "lists",
}

export const DEFAULT_SETTINGS: DataviewPropertiesSettings = {
	prefix: "dv_",
	dql: true,
	djs: true,
	listFields: {
		fields: [],
		lowerCase: true,
		ignoreAccents: true,
	},
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
	deleteFromFrontmatter: {
		enabled: true,
		lowerCase: true,
		ignoreAccents: true,
	},
};
