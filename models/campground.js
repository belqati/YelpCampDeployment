let mongoose = require("mongoose");

// data model for new campgrounds via .Schema() and .model()
let campgroundSchema = new mongoose.Schema({
  name: String,
  // price as String allows us to preserve css formatting
  price: String,
  image: String,
  imageId: String,
  description: String,
  location: String,
  lat: Number,
  lng: Number,
  createdAt: {
    type: Date,
    default: Date.now
  },
  // add username and id to model
  author: {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
      },
    username: String,
    avatar: String,
  },
  comments: [
    {
      // referencing comments collection in DB via object IDs
      type: mongoose.Schema.Types.ObjectId,
      ref: "Comment"
    }
  ]
});

// compile data pattern as a model for Mongoose methods, then export as a module to make contents accessible elsewhere
let Campground = mongoose.model("Campground", campgroundSchema);
module.exports = Campground;
