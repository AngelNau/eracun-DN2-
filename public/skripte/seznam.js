// Premakni film iz seznama (desni del) v košarico (levi del)
const premakniFilmIzSeznamaVKosarico = (
  id,
  naslov,
  jezik,
  ocena,
  trajanje,
  azuriraj
) => {
  if (azuriraj)
    $.get("/kosarica/" + id, (podatki) => {
      /* Dodaj izbran film v sejo */
    });

  // Dodaj film v desni seznam
  $("#kosarica").append(
    "<div id='" +
      id +
      "' class='film'> \
         <button type='button' class='btn btn-light btn-sm'> \
           <i class='fas fa-minus'></i> \
             <strong><span class='naslov'>" +
      naslov +
      "</span></strong> \
         <i class='fas fa-globe-europe'></i><span class='jezik'>" +
      jezik +
      "</span> \
        <i class='fas fa-signal'></i><span class='ocena'>" +
      ocena +
      "</ocena>\
        <i class='far fa-clock'></i><span class='trajanje'>" +
      trajanje +
      "</span> min \
          </button> \
          <input type='button' onclick='vecPodrobnostiFilma(" +
      id +
      ")' class='btn btn-info btn-sm' value='...'> \
        </div>"
  );

  // Dogodek ob kliku na film v košarici (na desnem seznamu)
  $("#kosarica #" + id + " button").click(function () {
    let film_kosarica = $(this);
    $.get("/kosarica/" + id, (podatki) => {
      /* Odstrani izbrano film iz seje */
      // Če je košarica prazna, onemogoči gumbe za pripravo računa
      if (!podatki || podatki.length == 0) {
        $("#racun_html").prop("disabled", true);
        $("#racun_xml").prop("disabled", true);
      }
    });
    // Izbriši film iz desnega seznama
    film_kosarica.parent().remove();
    // Pokaži film v levem seznamu
    $("#filmi #" + id).show();
  });

  // Skrij film v levem seznamu
  $("#filmi #" + id).hide();
  // Ker košarica ni prazna, omogoči gumbe za pripravo računa
  $("#racun_html").prop("disabled", false);
  $("#racun_xml").prop("disabled", false);
};

// Vrni več podrobnosti filmi
const vecPodrobnostiFilma = (id) => {
  $.get("/vec-o-filmu/" + id, (podatki) => {
    var spremenljivka = "<div id='" + id + "' style='background: #D1EDF1; border-radius: 4px; margin-bottom: 10px; color: #4682B4; font-size: 14px'><strong>Trajanje:</strong> " + podatki.trajanje + " min<br>" +
                    "<strong>Žanr:</strong> " + podatki.zanri + "<br>" +
                    "<strong>Leto izdaje:</strong> " + podatki.datumIzdaje.substr(0,4) + "</div>";
    var div = $("#sporocilo");
    var otroci = div.children();

    if(otroci.attr("id") != id){
      div.children().remove();
      div.append(spremenljivka);
    }else{
      div.children().remove();
    }
    console.log(podatki);
  });
};

$(document).ready(() => {
  // Posodobi podatke iz košarice na spletni strani
  $.get("/kosarica", (kosarica) => {
    kosarica.forEach((film) => {
      premakniFilmIzSeznamaVKosarico(
        film.stevilkaArtikla,
        film.opisArtikla.split(" (")[0],
        film.jezik,
        film.ocena,
        film.trajanje,
        false
      );
    });
  });

  // Klik na film v levem seznamu sproži
  // dodajanje filma v desni seznam (košarica)
  $("#filmi .film button").click(function () {
    let film = $(this);
    premakniFilmIzSeznamaVKosarico(
      film.parent().attr("id"),
      film.find(".naslov").text(),
      film.find(".jezik").text(),
      film.find(".ocena").text(),
      film.find(".trajanje").text(),
      true
    );
  });

  // Nariši graf
  $.get("/podroben-seznam-filmov", (seznam) => {
    var tabela = [];
    var randomIndeks = Math.floor(Math.random()*(seznam.length));
    let razlika = seznam[randomIndeks].dobicek - seznam[randomIndeks].stroski;
    for(var i = 0; i < seznam.length; i++) {
      tabela.push({
        x: new Date(seznam[i].datumIzdaje),
        y: seznam[i].ocena,
        label: seznam[i].naslov + ", " + dobicekOzIzguba(seznam[i].dobicek, seznam[i].stroski) + " " + 
        ((vrednost(seznam[i].dobicek, seznam[i].stroski) > 1000000 || vrednost(seznam[i].dobicek, seznam[i].stroski) < -1000000 ) ? Math.round(vrednost(seznam[i].dobicek, seznam[i].stroski)/1000000) : vrednost(seznam[i].dobicek, seznam[i].stroski)) + " " + milijonov(seznam[i].dobicek, seznam[i].stroski) + " € ",
      });
    }
    let chart = new CanvasJS.Chart("chartContainer", {
      title: {
        text: "Najboljši filmi čez čas: ocene in donosnost",
        fontColor: "#400080",
      },
      subtitles: [
        {
          text: seznam[randomIndeks].naslov + ", " + dobicekOzIzguba(seznam[randomIndeks].dobicek, seznam[randomIndeks].stroski) + " " + 
          ((vrednost(seznam[randomIndeks].dobicek, seznam[randomIndeks].stroski) > 1000000 || vrednost(seznam[randomIndeks].dobicek, seznam[randomIndeks].stroski) < -1000000 ) ? Math.round(vrednost(seznam[randomIndeks].dobicek, seznam[randomIndeks].stroski)/1000000) : vrednost(seznam[randomIndeks].dobicek, seznam[randomIndeks].stroski)) + " " 
          + milijonov(seznam[randomIndeks].dobicek, seznam[randomIndeks].stroski) + " € ",
          fontColor: "#009900",
        },
      ],
      axisX: {
        title: "Datum Izdaje"
      },
      axisY: {
        title: "Ocena",
      },
      data: [{
        type: "scatter",
        name: "Film",
        showInLegend: true,
        markerType: "cross",
        markerSize: 8,
        dataPoints: tabela,
      }]
    });
    chart.render();
  });
  function dobicekOzIzguba(dobicek, izguba) {
    if(dobicek - izguba >= 0) {
      return "dobiček";
    } else {
      return "izguba";
    }
  }
  function vrednost(dobicek, izguba) {
    if(dobicek - izguba < 0) {
      return ((dobicek - izguba) * (-1));
    } else {
      return (dobicek - izguba);
    }
  }
  function milijonov(dobicek, izguba) {
    if(vrednost(dobicek, izguba) > 1000000) {
      return "milijonov";
    } else {
      return "";
    }
  }
  // Klik na gumba za pripravo računov
  $("#racun_html").click(() => (window.location = "/izpisiRacun/html"));
  $("#racun_xml").click(() => (window.location = "/izpisiRacun/xml"));
});
