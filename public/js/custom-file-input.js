// custom-file-input modification + css for restyling, based on https://tympanus.net/codrops/2015/09/15/styling-customizing-file-inputs-smart-way/
// the original script also supports multifile uploads and includes a counter
// N.B.: .inputfile:invalid must be modded in css to show error messages

"use strict";

;( function ( document, window, index )
{
  let inputs = document.querySelectorAll( ".inputfile" );
  Array.prototype.forEach.call( inputs, function( input )
  {
    let label  = input.nextElementSibling;

    input.addEventListener( "change", function( e )
    {
      let fileName = e.target.value.split( "\\" ).pop();
      label.querySelector( "span" ).innerHTML = fileName;
    });

    // Firefox bug fix
    input.addEventListener( "focus", function(){ input.classList.add( "has-focus" ); });
    input.addEventListener( "blur", function(){ input.classList.remove( "has-focus" ); });
  });
}( document, window, 0 ));