const Joi = require('joi');

const scheduleGenerateSchema = Joi.object({
  startHour: Joi.number().integer().min(0).max(23).optional(),
  endHour: Joi.number()
    .integer()
    .min(1)
    .max(23)
    .optional()
    .when('startHour', {
      is: Joi.number().exist(),
      then: Joi.number().greater(Joi.ref('startHour')).messages({
        'number.greater': 'endHour must be greater than startHour',
      }),
    }),
});

module.exports = { scheduleGenerateSchema };
