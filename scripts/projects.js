let projects=[];
let filters=[];
function projects_init(){
    projects=[...document.querySelectorAll('.project')].map((node)=>{
        let event_type=node.querySelector('.metadata.event-type')?.dataset?.item ?? null;
        let tags=[...node.querySelectorAll('.metadata.tag')].map(tag_node=>tag_node.dataset.item);

        return {
            event_type,
            tags,
            node
        }
    })

    filters=[...document.querySelectorAll('#filters input[type="checkbox"]')];

    for(let filter of filters){
        filter.addEventListener('change',refresh_projects_filter)
    }

    document.querySelector('#clear-filters').addEventListener('click',clear_filters)
    document.querySelector('#filters summary').addEventListener('click',clear_filters)

}

function clear_filters(){
    for(let filter of filters) filter.checked=false;
    refresh_projects_filter();
}

function refresh_projects_filter(){
    let selected_event_types=[];
    let selected_tags=[];
    for(let filter of filters){
        if(filter.checked){
            if(filter.dataset.event_type) selected_event_types.push(filter.dataset.event_type);
            else if(filter.dataset.tag) selected_tags.push(filter.dataset.tag);
        }
    }

    console.log(selected_event_types,selected_tags);

    for(let project of projects){
        let n_matching=0;
        if(selected_event_types.includes(project.event_type)) n_matching++;
        for(let tag of project.tags) if(selected_tags.includes(tag)) n_matching++;
        // toggle the class
        project.node.classList.toggle('selected',n_matching>0);
        // set the order for matches
        project.node.style.setProperty('--match-order',1000 - n_matching);
    }


    document.querySelectorAll('.project .metadata.event-type').forEach((node)=>{
        node.classList.toggle('match',selected_event_types.includes(node.dataset.item))
    })
    document.querySelectorAll('.project .metadata.tag').forEach((node)=>{
        node.classList.toggle('match',selected_tags.includes(node.dataset.item))
    })

    document.querySelector('#clear-filters').classList.toggle('active',selected_event_types.length+selected_tags.length>0);
    document.querySelector('#clear-filters').disabled=!(selected_event_types.length+selected_tags.length>0);
}

window.addEventListener('load',projects_init);