const Joi = require('joi');

const taskSchema = Joi.object({
  title: Joi.string().min(3).max(200).required(),
  deadline: Joi.string()
    .isoDate()
    .required()
    .custom((value, helpers) => {
      const deadlineDate = new Date(value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (deadlineDate <= today) {
        return helpers.error('any.invalid');
      }
      return value;
    })
    .messages({
      'any.invalid': 'deadline must be a future date',
    }),
  importance: Joi.number().integer().min(1).max(5).required(),
});

module.exports = { taskSchema };
