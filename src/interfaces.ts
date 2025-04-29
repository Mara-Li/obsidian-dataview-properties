export interface DataviewPropertiesSettings {
	dql: boolean;
	djs: boolean;
	/**
	 * The frequency of the plugin to check for changes in the file & update the frontmatter
	 * @format: ms
	 */
	frequency: number;
	/**
	 * Ignore the following fields
	 */
	ignoreFields: string[];
	/** Ignore with lowercase */
	lowerCase: boolean;

	/** ignore accents */
	ignoreAccents: boolean;
}

export const DEFAULT_SETTINGS: DataviewPropertiesSettings = {
	dql: true,
	djs: true,
	frequency: 1000,
	ignoreFields: [],
	lowerCase: true,
	ignoreAccents: true,
};
