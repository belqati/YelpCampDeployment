let express = require("express");
let router = express.Router();
let Campground = require("../models/campground");
// N.B.: for middleware, files named index.js load automatically in express, directory only is required
let middleware = require("../middleware");

// config node-geocoder
let NodeGeocoder = require('node-geocoder');
let options = {
  provider: 'google',
  httpAdapter: 'https',
  apiKey: process.env.GEOCODER_API_KEY,
  formatter: null
};
let geocoder = NodeGeocoder(options);

// config multer for file interaction via forms
let multer = require("multer");
let storage = multer.diskStorage({
  filename: function(req, file, callback) {
    callback(null, Date.now() + file.originalname);
  }
});
let imageFilter = function(req, file, cb) {
  // accept certain image files only
  if(!file.originalname.match(/\.(jpg|jpeg|png)$/i)) {
    // add new item to req object, then accessible to req object in following routes
    req.fileValidationError = "incorrect file type";
    return cb(null, false);
  }
  cb(null, true);
};
let upload = multer({storage: storage, fileFilter: imageFilter});

// config cloudinary for file hosting etc.
// N.B.: Cloudinary has tools to check for questionable content: WebPurify for human moderation; aws Rekognition for AI moderation; the former is fast, the latter instantaneous; must sign-up for them to employ
let cloudinary = require("cloudinary");
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_USER,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_SECRET
});

// INDEX route -- show all campgrounds
router.get("/", function(req, res) {
  // paginate all campgrounds
  let perPage = 8;
  let pageQuery = parseInt(req.query.page);
  let pageNumber = pageQuery ? pageQuery : 1;
  let noMatch = null;
  
  // GET all campgrounds from DB
  Campground.find({}).skip((perPage * pageNumber) - perPage).limit(perPage).exec(function(err, allCampgrounds) {
    Campground.count().exec(function(err, count) {
      if(err) {
        req.flash("error", "Something wonky just happened!");
        return res.redirect("back");
      } else {
        res.render("campgrounds/index", {
          campgrounds: allCampgrounds,
          current: pageNumber,
          pages: Math.ceil(count / perPage),
          noMatch: noMatch,
          search: false
        });
      }
    });
  });
});

// CREATE route -- add new campground to DB
// middleware: must be logged in
router.post("/", middleware.isLoggedIn, upload.single("image"), function(req, res) {
  let name = req.body.campground.name;
  let price = req.body.campground.price;
  let image = req.body.campground.image;
  let imageId = req.body.campground.imageId;
  let desc = req.body.campground.description;

  // add id, username, and avatar from user model
  let author = {
    id: req.user._id,
    username: req.user.username,
    avatar: req.user.avatar
  }

  // check if multer fileFilter added "fileValidationError" to req object 
  if(req.fileValidationError) {
    req.flash("error", "Sorry, only .jpg, .jpeg, and .png files are allowed.");
    return res.redirect("back");
  }

  // upload to cloudinary; folder option allows for media organization
  // moderation: add to folder option {..., moderation: "webpurify"} or {..., moderation: "aws_rek"}
  cloudinary.v2.uploader.upload(req.file.path, {folder: "yelp_camp/campgrounds"}, function(err, result) {
    if(err) {
      req.flash("error", "Oops, upload failed!");
      return res.redirect("back");
    }
    // add cloudinary image url and id to campground object
    image = result.secure_url;
    imageId = result.public_id;

    // get geocoder data and add to campground object
    geocoder.geocode(req.body.location, function(err, data) {
      if(err || !data.length) {
        req.flash("error", "That appears to be an invalid address!");
        return res.redirect("back");
      }
      let lat = data[0].latitude;
      let lng = data[0].longitude;
      let location = data[0].formattedAddress;
      let newCampground = {name: name, price: price, image: image, imageId: imageId, description: desc, author: author, location: location, lat: lat, lng: lng};
      // create new campground and send to DB
      Campground.create(newCampground, function(err, newObj) {
        if(err) {
          req.flash("error", "Whoops, campground not created.");
          return res.redirect("back");
        } else {
          req.flash("success", "New campground created!")
          res.redirect("/campgrounds/" + newObj.id);
        }
      });
    });

  });
});

// NEW route -- form input for CREATE route
router.get("/new", middleware.isLoggedIn, function(req, res) {
  res.render("campgrounds/new");
});

// SHOW route -- shows specific campground
router.get("/:id", function(req, res) {
  // find campground, populate comments array from comments collection
  Campground.findById(req.params.id).populate("comments").exec(function(err, itemObj) {
    if(err || !itemObj) {
      req.flash("error", "Campground not found!");
      res.redirect("back");
    }
    res.render("campgrounds/show", {campground: itemObj});
  });
});

// EDIT route -- edit campground form
router.get("/:id/edit", middleware.checkCampgroundOwnership, function(req, res) {
  Campground.findById(req.params.id, function(err, foundCampground) {
    if(err) {
      req.flash("error", "Yikes, something went wrong!")
      res.redirect("/campgrounds");
    }
    res.render("campgrounds/edit", {campground: foundCampground});
  });
});

// UPDATE route -- update campground
router.put("/:id", middleware.checkCampgroundOwnership, upload.single("image"), function(req, res) {

  // async-await: gather all update data before finishing findById replacement
  Campground.findById(req.params.id, async function(err, campground){

    if(err){
      req.flash("error", "Hmmm, not sure what just happened.");
      res.redirect("back");
    } else {
      // if update image via multer req.file object
      if (req.file) {
        // try-catch: runs await and catches errors
        try {
          // delete old image from cloudinary; invalidate option deletes cached url--otherwise could linger up to 30 days
          await cloudinary.v2.uploader.destroy(campground.imageId, {invalidate: true});
          // upload/assign new image/imageId
          // moderation: {..., moderation: "webpurify"} or {..., moderation: "aws_rek"}
          let result = await cloudinary.v2.uploader.upload(req.file.path, {folder: "yelp_camp/campgrounds"});
          campground.imageId = result.public_id;
          campground.image = result.secure_url;
        } catch(err) {
          req.flash("error", "Upload unsuccessful for some reason.");
          return res.redirect("back");
        }
      }
      // try-catch for geocoder
      try {
        let data = await geocoder.geocode(req.body.location);
        campground.lat = data[0].latitude;
        campground.lng = data[0].longitude;
        campground.location = data[0].formattedAddress;
      } catch(err) {
        req.flash("error", "Sorry, that location does not appear to exist. Please try again.");
        return res.redirect("back");
      }
      // update data from other form fields
      campground.name = req.body.campground.name;
      campground.description = req.body.campground.description;
      campground.price = req.body.campground.price;
      campground.save();

      if(req.fileValidationError) {
        req.flash("error", "Sorry, only .jpg, .jpeg, and .png files are allowed.");
        return res.redirect("back");
      }
      req.flash("success", "Campground successfully updated!");
      return res.redirect("/campgrounds/" + campground._id);
    }
  });
});

// DESTROY route -- remove campground
router.delete("/:id", middleware.checkCampgroundOwnership, function(req, res) {

  Campground.findById(req.params.id, async function(err, campground) {
    if(err) {
      req.flash("error", "Campground destruction failed!");
      return res.redirect("/campgrounds");
    }
    try {
      await cloudinary.v2.uploader.destroy(campground.imageId);
      campground.remove();
      req.flash("success", "Campground removed successfully.")
      res.redirect("/campgrounds");
    } catch(err) {
      req.flash("error", "Failed to remove serverside campground image!");
      return res.redirect("/campgrounds");
    }
  });
});

module.exports = router;