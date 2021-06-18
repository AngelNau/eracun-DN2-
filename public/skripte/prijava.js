$(document).ready(() => {
  $("#FirstName").keyup(() => {
    console.log("Preveri ime nove stranke.");
    var regex = /^[a-zA-ZšŠđĐžŽčČćĆ-]{2,14}$/g
    if($("#FirstName").val().match(regex)) {
      console.log($("#FirstName").val().length);
      $("#FirstNameStatus").children().attr("class", "fas fa-check");
      $("#FirstName").addClass("dovoljeno");
    } else {
      console.log($("#FirstName").val());
      $("#FirstNameStatus").children().attr("class", "fas fa-times");
      $("#FirstName").removeClass("dovoljeno");
    }
    if($("#FirstName").hasClass("dovoljeno") && $("#Country").hasClass("dovoljeno")) {
      $("#Register").attr("disabled", false);
    } else {
      $("#Register").attr("disabled", true);
    }
  });
  

  $("#Country").keyup(() => {
    console.log("Preveri državo nove stranke.");
    var temp;
    jQuery.get("/stranke_po_drzavah", vrstice => {
      for(let i = 0; i < vrstice.length; i++ ) {
        if(vrstice[i].drzava.toLowerCase() == $("#Country").val().toLowerCase()) {
          temp = vrstice[i].stUporabnikov;
          break;
        } else {
          temp = 0;
        }
      }
      /*vrstice.forEach(element => {
        if(element.drzava.toLowerCase() == $("#Country").val().toLowerCase()) {
          temp = element.stUporabnikov;
        } else {
          temp = 0;
        }
      });*/
      if($("#Country").val().length >= 3 && temp <= 5 && temp >= 0) {
        $("#CountryStatus").children().attr("class", "fas fa-check");
        $("#Country").addClass("dovoljeno");
        $("#obstojeceStrankeId").html(temp);
      } else {
        $("#CountryStatus").children().attr("class", "fas fa-times");
        $("#Country").removeClass("dovoljeno");
        $("#obstojeceStrankeId").html(temp);
      }
      if($("#FirstName").hasClass("dovoljeno") && $("#Country").hasClass("dovoljeno")) {
        $("#Register").attr("disabled", false);
      } else {
        $("#Register").attr("disabled", true);
      }
      console.log(temp);
    })
    
  });

  // Poslušalec ob kliku z miško na izbran račun
  $("select#seznamRacunov").change(function (e) {
    let izbranRacunId = $(this).val();
    $.get("/jeziki-racuna/" + izbranRacunId, (racunJeziki) => {
      $("#jezikiRacuna").html(racunJeziki);
    });
  });
});
