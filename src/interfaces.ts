type DataviewOptions = {
	block: boolean;
	inline: boolean;
};

export interface DataviewPropertiesSettings {
	dql: DataviewOptions;
	djs: DataviewOptions;
	/**
	 * The frequency of the plugin to check for changes in the file & update the frontmatter
	 * @format: ms
	 */
	frequency: number;
}

export const DEFAULT_SETTINGS: DataviewPropertiesSettings = {
	dql: {
		block: true,
		inline: true,
	},
	djs: {
		block: true,
		inline: true,
	},
	frequency: 1000,
};
