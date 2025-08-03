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

export type Ignore = {
	/**
	 * Can be a regex or a string file path
	 */
	files: string[];
	/**
	 * If "key_name" is true in the properties, the file will be ignored by the parser.
	 * @default dv_ignore
	 * @example
	 * ```yaml
	 * dv_ignore: true
	 * ```
	 */
	keyName: string;
};

export interface DataviewPropertiesSettings {
	prefix: string;
	ignore: Ignore;
	unflatten: Unflatten;
	listSuffix: string;
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

export type Unflatten = {
	enabled: boolean;
	/**
	 * The character(s) used to separate nested properties in the frontmatter.
	 * @default _
	 * @important DV doesn't support `.` as a separator, so it is not allowed.
	 */
	separator: string;
};

export const DEFAULT_SETTINGS: DataviewPropertiesSettings = {
	prefix: "dv_",
	listSuffix: "_list",
	unflatten: {
		enabled: false,
		separator: "__",
	},
	ignore: {
		files: [],
		keyName: "dv_ignore",
	},
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
