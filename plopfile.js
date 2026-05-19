/**
 * @file plopfile.js
 * @description Automation configuration for Plop.js code generation.
 * Generates standardized module structures and utility files to ensure architectural consistency.
 * @module Tools/Plop
 */
export default function (plop) {
  /**
   * @generator module
   * @description Generates a full Enterprise Module package (Schema, Repo, Service, Controller, Route).
   */
  plop.setGenerator('module', {
    description: 'Create an Enterprise Module (5 files)',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'What is the name of the new module? (e.g., course, user, product_category):',
        validate: function (value) {
          if ((/.+/).test(value)) { return true; }
          return 'Module name cannot be empty';
        }
      }
    ],
    actions: [
      {
        type: 'add',
        path: 'src/modules/{{dashCase name}}/{{dashCase name}}.route.ts',
        templateFile: 'plop-templates/module/route.ts.hbs'
      },
      {
        type: 'add',
        path: 'src/modules/{{dashCase name}}/{{dashCase name}}.controller.ts',
        templateFile: 'plop-templates/module/controller.ts.hbs'
      },
      {
        type: 'add',
        path: 'src/modules/{{dashCase name}}/{{dashCase name}}.service.ts',
        templateFile: 'plop-templates/module/service.ts.hbs'
      },
      {
        type: 'add',
        path: 'src/modules/{{dashCase name}}/{{dashCase name}}.repository.ts',
        templateFile: 'plop-templates/module/repository.ts.hbs'
      },
      {
        type: 'add',
        path: 'src/modules/{{dashCase name}}/{{dashCase name}}.schema.ts',
        templateFile: 'plop-templates/module/schema.ts.hbs'
      }
      
    ]
  });

  /**
   * @generator common
   * @description Generates a single utility or helper file within the src/common/ directory.
   */
  plop.setGenerator('common', {
    description: 'Create a file in the src/common/ directory',
    prompts: [
      {
        type: 'list',
        name: 'folder',
        message: 'Where do you want to create the file in common?',
        choices: ['utils', 'helpers', 'services', 'configs']
      },
      {
        type: 'input',
        name: 'name',
        message: 'What is the name of the file? (e.g., format-date):'
      }
    ],
    actions: [
      {
        type: 'add',
        path: 'src/common/{{folder}}/{{dashCase name}}.{{singularize folder}}.ts',
        template: 'export const {{camelCase name}} = () => {\n  // Code here\n};\n'
      }
    ]
  });
  
  /**
   * @helper singularize
   * @description Utility to convert plural folder names (configs) to singular filename suffixes (.config).
   */
  plop.setHelper('singularize', (text) => text.replace(/s$/, ''));
};