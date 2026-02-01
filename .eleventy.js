require('dotenv').config();
const marked = require('marked');
marked.use({mangle: false,headerIds: false});

module.exports = function(eleventyConfig) {
  


  eleventyConfig.addDataExtension("md", contents => {html:marked.parse(contents)});

  eleventyConfig.addNunjucksFilter('find_post',function(posts, title){

      let match=posts.find( (post)=>{
        // console.log('query:',title,'\nname:',post.data.title,'\n----------------')
        return post.data.title==title;
      } )

      return match;
  })

  eleventyConfig.addNunjucksFilter( "env", function(value) {    
    return process.env[value]
  });

  // eleventyConfig.addJavaScriptFunction("filter_out_landing", (pages) => {
  //   console.log('test test hello',pages);
  //   return pages.filter(page => !page.properties.template.value.includes("home"));
  // });

  eleventyConfig.addNunjucksFilter( "notion_data_find", function(array,property,value) {   
    return array.find(item=>item.properties[property].value==value);
  });

  eleventyConfig.addNunjucksFilter( "notion_data_find_in_select", function(array,property,value) {   
    return array.find(item=>item.properties[property].value.includes(value));
  });

  eleventyConfig.addNunjucksFilter( "console_debug", function(value,prefix) {    
    if(prefix) console.log(prefix,value);
    else console.log(value);
    return value;
  });


  eleventyConfig.addNunjucksFilter( "date_format", function({start,end} = {}) {  
    if(!start) return '';
    let start_date=new Date(start);
    let start_ymd={
      year:start_date.getFullYear(),
      month:start_date.toLocaleString('default', { month: 'long' }),
      day:start_date.getDay()
    }

    if(end){
      let end_date=new Date(end);
      let end_ymd={
        year:end_date.getFullYear(),
        month:end_date.toLocaleString('default', { month: 'long' }),
        day:end_date.getDay()
      }
      if(end_ymd.year !==start_ymd.year){
        // if years are different, do month year - month year
        return `${start_ymd.month} ${start_ymd.year} — ${end_ymd.month} ${end_ymd.year}`
      }else if(end_ymd.month !== start_ymd.month){
        // if months are different, do month - month year
        return `${start_ymd.month} — ${end_ymd.month} ${start_ymd.year}`;
      }else if (end_ymd.day !== start_ymd.day){
        // if days are different, do month day-day, year
        return `${start_ymd.month} ${start_ymd.day} — ${end_ymd.day}, ${start_ymd.year}`;
      }else{
        return format_single_day(start_ymd);
      }
      
    }else{
      return format_single_day(start_ymd);
    }

    function format_single_day({year,month,day}){
        return `${month} ${day}, ${year}`;
    }
    
    return '';

    // range 
    // if(value?.start && value?.end){

    // }else if(value?.start){

    // }else{
    //   return '';
    // }

    // if(prefix) console.log(prefix,value);
    // else console.log(value);
    // return value;
  });

  eleventyConfig.addNunjucksFilter("notion_sort_by_date", function(array) {    
    let sorted=array.toSorted((a,b)=>{
      let a_date=a.properties.date?.value?.start || '';
      let b_date=b.properties.date?.value.start || '';
      let a_locale=a_date.replaceAll('-','')
      let b_locale=a_date.replaceAll('-','')
      return a_locale.localeCompare(b_locale);
    })
    return sorted;
  });

  let ital=(v)=>`<em>${v}</em>`;
  let bold=(v)=>`<strong>${v}</strong>`;
  let link=(v,href)=>`<a href="${href}">${v}</a>`

  eleventyConfig.addNunjucksFilter("notion_rich_text_to_html",function(rich_text_nodes = []){
    let html_str = '';
    for(let node of rich_text_nodes){
      let v=node.text?.content || '';
      if(node.annotations.italic) v=ital(v);
      if(node.annotations.bold) v=bold(v);
      if(node.href) v=link(v,node.href);

      html_str+=v;
    }
    return html_str;
  })

  eleventyConfig.addNunjucksFilter('pretty_link',function(url){
    return url.replace('http://','').replace('https://','').replace('www.','');
  })

  eleventyConfig.addNunjucksFilter( "md", function(value) {    
    var result;
      try {
        result = marked.parse(value)
        return result;
      } catch (e) {
        return "";
      }
  });



  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addTemplateFormats('md,njk,css,js')

  

    // Return your Object options:
    return {
      dir: {
        input: "input",
        output: "_site"
      }
    }
};
