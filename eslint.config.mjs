import globals from "globals";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.eslint.json",
        sourceType: "module"
      },
      globals: {
        ...globals.node
      }
    },
    plugins: {
      "@typescript-eslint": tseslint
    },
    rules: {
      "no-unused-vars": "off",
      "no-console": "off",
      "prefer-const": "warn",
      "eqeqeq": ["warn", "always"],

      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-var-requires": "off",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports" }
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/strict-boolean-expressions": "error",
      "@typescript-eslint/no-unnecessary-condition": "warn",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/explicit-member-accessibility": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",

      "no-restricted-syntax": [
        "warn",
        {
          selector: "TSAsExpression[expression.type='TSAsExpression'][expression.typeAnnotation.type='TSUnknownKeyword']",
          message: "Avoid 'as unknown as X' double-casts. Prefer a named type for the populate/lean result (or .populate<T>()) so the cast is checked once instead of bypassed twice."
        }
      ]
    }
  },
  {
    files: ["src/**/dto/*.dto.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSUnknownKeyword",
          message: "The 'unknown' type is disallowed in DTOs. Please use more specific types."
        },
        {
          selector: "TSTypeReference[typeName.name='Record']",
          message: "Raw 'Record' objects are disallowed in DTOs. Define an explicit interface or DTO class for structured data."
        },
        {
          selector: "TSObjectKeyword",
          message: "The 'object' type is disallowed in DTOs. Define an explicit DTO class."
        },
        {
          selector: "TSTypeLiteral[members.length=0]",
          message: "The empty object type '{}' is disallowed in DTOs."
        }
      ]
    }
  },
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "packages/**/dist/**",
      "packages/**/node_modules/**",
    ]
  }
];
