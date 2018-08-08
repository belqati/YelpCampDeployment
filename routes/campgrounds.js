let express = require("express");
let router = express.Router();
let Campground = require("../models/campground");
// N.B.: index.js is a file name that is automatically loaded by express, so only its directory is required
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

// config multer, used for file interaction via form input
let multer = require("multer");
let storage = multer.diskStorage({
  filename: function(req, file, callback) {
    callback(null, Date.now() + file.originalname);
  }
});
let imageFilter = function(req, file, cb) {
  // accept certain image files only
  if(!file.originalname.match(/\.(jpg|jpeg|png)$/i)) {
    // pass new item to req object, accessible to req object in routes
    req.fileValidationError = "incorrect file type";
    return cb(null, false);
  }
  cb(null, true);
};
let upload = multer({storage: storage, fileFilter: imageFilter});

// config cloudinary, used for file hosting and manipulation
// N.B.: allowing user uploads opens door to questionable content--Cloudinary has tools to check for this (human moderation via WebPurify; AI moderation via aws Rekognition); the former is fast, the latter instantaneous
let cloudinary = require("cloudinary");
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_USER,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_SECRET
});

// INDEX route -- show all campgrounds
router.get("/", function(req, res) {
  // pagination for campgrounds
  let perPage = 8;
  let pageQuery = parseInt(req.query.page);
  let pageNumber = pageQuery ? pageQuery : 1;
  let noMatch = null;
  
  // GET all campgrounds from DB
  Campground.find({}).skip((perPage * pageNumber) - perPage).limit(perPage).exec(function(err, allCampgrounds) {
    Campground.count().exec(function(err, count) {
      if(err) {
        console.log(err);
        req.flash("error", err.message);
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

// CREATE route -- add new campground to DB from form, redirect to INDEX route
// middleware: must be logged in to create a campground
router.post("/", middleware.isLoggedIn, upload.single("image"), function(req, res) {
  let name = req.body.campground.name;
  let price = req.body.campground.price;
  let image = req.body.campground.image;
  let imageId = req.body.campground.imageId;
  let desc = req.body.campground.description;
  // add username and id from user model
  let author = {
    id: req.user._id,
    username: req.user.username
  }

  // check if multer fileFilter added "fileValidationError" to req object 
  if(req.fileValidationError) {
    req.flash("error", "Sorry, only .jpg, .jpeg, and .png files are allowed.");
    return res.redirect("back");
  }
  // upload to cloudinary; folder option allows for media organization in cloud media library
  // for image moderation add with folder option {..., moderation: "webpurify"} or {..., moderation: "aws_rek"}
  cloudinary.v2.uploader.upload(req.file.path, {folder: "yelp_camp/campgrounds"}, function(err, result) {
    if(err) {
      req.flash("error", err.message);
      return res.redirect("back");
    }
    // add cloudinary url and id for image to campground object
    image = result.secure_url;
    imageId = result.public_id;

    // get geocoder data and add to campground object
    geocoder.geocode(req.body.location, function(err, data) {
      if(err || !data.length) {
        console.log(err);
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
          console.log(err);
          req.flash("error", err.message);
          return res.redirect("back");
        } else {
          req.flash("success", "New campground created!")
          res.redirect("/campgrounds/" + newObj.id);
          console.log(newObj);
        }
      });
    });

  });
});

// NEW route -- form to collect user input for CREATE route
router.get("/new", middleware.isLoggedIn, function(req, res) {
  res.render("campgrounds/new");
});

// SHOW route -- shows all info for a specific campground
router.get("/:id", function(req, res) {
  // find campground via MongoDB id, populate comments array from comments collection
  Campground.findById(req.params.id).populate("comments").exec(function(err, itemObj) {
    // check if err OR itemObj is null
    // must handle null or it will pass and crash the application, because null.image etc. does not exist
    if(err || !itemObj) {
      req.flash("error", "Campground not found!");
      res.redirect("back");
    } else {
      console.log(itemObj);
      // render show page template
      res.render("campgrounds/show", {campground: itemObj});
    }
  });
});

// EDIT route -- edit form for specific campground
// middleware: checks for user auth and authorization
router.get("/:id/edit", middleware.checkCampgroundOwnership, function(req, res) {
  Campground.findById(req.params.id, function(err, foundCampground) {
    if(err) {
      res.redirect("/campgrounds");
    } else {
      res.render("campgrounds/edit", {campground: foundCampground});
    }
  });
});

// UPDATE route -- update specific campground and redirect
router.put("/:id", middleware.checkCampgroundOwnership, upload.single("image"), function(req, res) {

  // use async-await to gather all update data before finishing findById replacement; N.B.: older browsers not supported
  Campground.findById(req.params.id, async function(err, campground){

    if(err){
      req.flash("error", err.message);
      res.redirect("back");
    } else {
      // look for a requested update image via multer req.file object
      if (req.file) {
        // try-catch used to run await and catch any errors
        try {
          // delete old image from cloudinary; invalidate option deletes cached url as well--otherwise could linger for up to 30 days
          await cloudinary.v2.uploader.destroy(campground.imageId, {invalidate: true});
          // upload and assign new image and imageId
          // for image moderation add with folder option {..., moderation: "webpurify"} or {..., moderation: "aws_rek"}
          let result = await cloudinary.v2.uploader.upload(req.file.path, {folder: "yelp_camp/campgrounds"});
          campground.imageId = result.public_id;
          campground.image = result.secure_url;
        } catch(err) {
          req.flash("error", err.message);
          return res.redirect("back");
        }
      }
      // try-catch error handling for geocoder
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

      // check if multer fileFilter added "fileValidationError" to req object 
      if(req.fileValidationError) {
        req.flash("error", "Sorry, only .jpg, .jpeg, and .png files are allowed.");
        return res.redirect("back");
      }
      req.flash("success", "Campground successfully updated!");
      return res.redirect("/campgrounds/" + campground._id);
    }
  });
});

// DESTROY route -- remove specific campground
router.delete("/:id", middleware.checkCampgroundOwnership, function(req, res) {

  Campground.findById(req.params.id, async function(err, campground) {
    if(err) {
      req.flash("error", err.message);
      return res.redirect("/campgrounds");
    }
    try {
      await cloudinary.v2.uploader.destroy(campground.imageId);
      campground.remove();
      req.flash("success", "Campground removed successfully.")
      res.redirect("/campgrounds");
    } catch(err) {
      req.flash("error", err.message);
      return res.redirect("/campgrounds");
    }
  });
});

// function for fuzzy search using regex
function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
};

module.exports = router;