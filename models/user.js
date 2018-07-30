let mongoose = require("mongoose");
let passportLocalMongoose = require("passport-local-mongoose");

let userSchema = new mongoose.Schema({
  username: String,
  password: String,
  isAdmin: {
    type: Boolean,
    default: false
  },
  avatar: String,
  avatarId: String,
  firstName: String,
  lastName: String,
  email: {
    type: String,
    unique: true,
    required: true
  },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  userBackground: String
});

// adds passport methods to schema via mongoose
// applied only to User model since only the user needs authentication and authorization
userSchema.plugin(passportLocalMongoose);
module.exports = mongoose.model("User", userSchema);