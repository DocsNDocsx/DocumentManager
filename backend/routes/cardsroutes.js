const express = require('express');
const verifyJwt = require('../middleware/auth');
const cardsController = require('../controllers/cardscontroller');
const router = express.Router();
router.use(verifyJwt);

router.get('/cards', cardsController.getCards);
router.post('/cards', cardsController.addCard);
router.patch('/cards/:id/default', cardsController.setDefault);
router.delete('/cards/:id', cardsController.deleteCard);

module.exports = router;
