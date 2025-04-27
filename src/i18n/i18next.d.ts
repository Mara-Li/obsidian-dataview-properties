import type { resources } from "../i18n";

declare module "i18next" {
	interface CustomTypeOptions {
		readonly resources: (typeof resources)["en"];
		readonly returnNull: false;
	}
}
