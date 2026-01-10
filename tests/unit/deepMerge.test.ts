import { describe, expect, test } from "bun:test";
import { deepMerge } from "../../src/utils";

describe("deepMerge", () => {
	test("should merge two simple objects", () => {
		const target = { a: 1, b: 2 };
		const source = { b: 3, c: 4 };
		const result = deepMerge(target, source);
		expect(result).toEqual({ a: 1, b: 3, c: 4 });
	});

	test("should merge nested objects", () => {
		const target = {
			dv_has_: {
				time_: {
					started: "-4.031e9",
				},
			},
		};
		const source = {
			dv_has_: {
				duration_: {
					years: "4.310e+8",
				},
			},
		};
		const result = deepMerge(target, source);
		expect(result).toEqual({
			dv_has_: {
				time_: {
					started: "-4.031e9",
				},
				duration_: {
					years: "4.310e+8",
				},
			},
		});
	});

	test("should merge deeply nested objects", () => {
		const target = {
			dv_has_: {
				time_: {
					started: "-4.031e9",
				},
				name_: {
					en: "English",
				},
			},
		};
		const source = {
			dv_has_: {
				time_: {
					stopped: "-3.600e9",
				},
				name_: {
					fr: "French",
				},
			},
		};
		const result = deepMerge(target, source);
		expect(result).toEqual({
			dv_has_: {
				time_: {
					started: "-4.031e9",
					stopped: "-3.600e9",
				},
				name_: {
					en: "English",
					fr: "French",
				},
			},
		});
	});

	test("should replace arrays instead of merging", () => {
		const target = { list: [1, 2, 3] };
		const source = { list: [4, 5] };
		const result = deepMerge(target, source);
		expect(result).toEqual({ list: [4, 5] });
	});

	test("should replace primitives", () => {
		const target = { a: 1, b: "old" };
		const source = { a: 2, b: "new" };
		const result = deepMerge(target, source);
		expect(result).toEqual({ a: 2, b: "new" });
	});

	test("should handle null and undefined", () => {
		expect(deepMerge(null, { a: 1 })).toEqual({ a: 1 });
		expect(deepMerge({ a: 1 }, null)).toEqual({ a: 1 });
		expect(deepMerge(undefined, { a: 1 })).toEqual({ a: 1 });
		expect(deepMerge({ a: 1 }, undefined)).toEqual({ a: 1 });
	});

	test("should not mutate original objects", () => {
		const target = { a: { b: 1 } };
		const source = { a: { c: 2 } };
		const result = deepMerge(target, source);
		expect(target).toEqual({ a: { b: 1 } });
		expect(source).toEqual({ a: { c: 2 } });
		expect(result).toEqual({ a: { b: 1, c: 2 } });
	});
});