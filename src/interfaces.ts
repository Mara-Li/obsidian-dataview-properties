export interface DataviewPropertiesSettings {
	dql: boolean;
	djs: boolean;
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
	ignoreFields: [],
	lowerCase: true,
	ignoreAccents: true,
};
